import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import mascotWave from '@/assets/mascot-wave.png';
import { signInWithGoogle } from '@/lib/googleSignIn';
import { isValidUsername } from '@/lib/safety';
import { explainAuthError } from '@/lib/authErrors';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupFullName, setSignupFullName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(loginEmail, loginPassword);

    if (error) {
      toast({ ...explainAuthError(error, 'přihlášení'), variant: 'destructive' });
    } else {
      toast({
        title: 'Vítej zpět!',
        description: 'Úspěšně jsi se přihlásil.',
      });
      onOpenChange(false);
    }

    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const username = signupUsername.trim().toLowerCase();
    if (!isValidUsername(username)) {
      toast({
        title: 'Zkontroluj přezdívku',
        description: '3 až 20 znaků, jen písmena bez háčků, číslice, tečka nebo podtržítko.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    const { error, needsEmailConfirmation } = await signUp(signupEmail, signupPassword, signupFullName, username);

    if (error) {
      // Dítě dostane srozumitelnou větu, konzole skutečnou chybu.
      toast({ ...explainAuthError(error, 'registrace'), variant: 'destructive' });
    } else if (needsEmailConfirmation) {
      toast({
        title: 'Ještě jeden krok',
        description: `Poslali jsme ti e-mail na ${signupEmail}. Klikni v něm na odkaz a pak se přihlas.`,
        duration: 12000,
      });
      onOpenChange(false);
    } else {
      toast({
        title: 'Účet vytvořen!',
        description: 'Vítej v Kamosféře.',
      });
      onOpenChange(false);
    }

    setIsLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const { error, redirected, needsSetup } = await signInWithGoogle();

    if (error) {
      toast({
        title: 'Přihlášení přes Google nejde',
        description: needsSetup
          ? 'Google zatím není pro Kamosféru zapnutý. Zatím se přihlas emailem.'
          : 'Zkus to prosím znovu, nebo se přihlas emailem.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    // Prohlížeč odchází na Google; zavírat okno nebo vypínat spinner
    // už nemá smysl.
    if (redirected) return;

    onOpenChange(false);
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center -mt-2">
            <img src={mascotWave} alt="Robot mává" className="w-24 h-24 object-contain" loading="lazy" />
          </div>
          <DialogTitle className="text-2xl font-bold text-center gradient-text">
            Kamosféra
          </DialogTitle>
        </DialogHeader>

        <Button
          type="button"
          variant="outline"
          className="w-full mt-4 gap-2"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
          </svg>
          Pokračovat s Google
        </Button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">nebo</span>
          </div>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Přihlášení</TabsTrigger>
            <TabsTrigger value="signup">Registrace</TabsTrigger>
          </TabsList>


          <TabsContent value="login" className="mt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="vas@email.cz"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Heslo</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Přihlásit se'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-6">
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Celé jméno</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="Jan Novák"
                  value={signupFullName}
                  onChange={(e) => setSignupFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-username">Přezdívka</Label>
                <Input
                  id="signup-username"
                  type="text"
                  placeholder="kamos_kuba"
                  value={signupUsername}
                  onChange={(e) => setSignupUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={20}
                  autoComplete="username"
                />
                <p className="text-xs text-muted-foreground">
                  Tuhle uvidí ostatní. Nedávej do ní svoje příjmení ani rok narození.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="vas@email.cz"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Heslo</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Vytvořit účet'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
