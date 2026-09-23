-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('user', 'vip', 'creator');

-- Create user_roles table for VIP and Creator roles
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    activated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own roles"
ON public.user_roles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create groups table
CREATE TABLE public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    owner_id UUID NOT NULL,
    is_private BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group_members table
CREATE TABLE public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (group_id, user_id)
);

-- Create group_messages table
CREATE TABLE public.group_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Groups policies
CREATE POLICY "Anyone can view public groups"
ON public.groups
FOR SELECT
USING (NOT is_private OR auth.uid() = owner_id OR EXISTS (
    SELECT 1 FROM public.group_members WHERE group_id = id AND user_id = auth.uid()
));

CREATE POLICY "Authenticated users can create groups"
ON public.groups
FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their groups"
ON public.groups
FOR UPDATE
USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their groups"
ON public.groups
FOR DELETE
USING (auth.uid() = owner_id);

-- Group members policies
CREATE POLICY "Members can view group members"
ON public.group_members
FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
) OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_members.group_id AND NOT g.is_private
));

CREATE POLICY "Users can join groups"
ON public.group_members
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can leave groups"
ON public.group_members
FOR DELETE
USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_members.group_id AND g.owner_id = auth.uid()
));

-- Group messages policies
CREATE POLICY "Members can view group messages"
ON public.group_messages
FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_messages.group_id AND gm.user_id = auth.uid()
));

CREATE POLICY "Members can send group messages"
ON public.group_messages
FOR INSERT
WITH CHECK (auth.uid() = sender_id AND EXISTS (
    SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_messages.group_id AND gm.user_id = auth.uid()
));

CREATE POLICY "Users can delete their own group messages"
ON public.group_messages
FOR DELETE
USING (auth.uid() = sender_id);

-- Enable realtime for group messages
DO $realtime$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
EXCEPTION
  -- Tabuľka už v publikácii je (migrácie sa prehrávajú aj na hotovej databáze).
  WHEN duplicate_object THEN NULL;
  -- SQL editor v Supabase beží pod rolou, ktorá na publikáciu nesiaha.
  -- Realtime sa dá zapnúť klikom v Database → Replication; kvôli tomuto
  -- nemá padnúť celá schéma.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Realtime: % — zapni ručne v Database → Replication.', 'public.group_messages';
  WHEN undefined_object THEN NULL;
END $realtime$;