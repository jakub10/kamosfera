import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VIP_CODE = Deno.env.get("VIP_ACTIVATION_CODE");
const CREATOR_CODE = Deno.env.get("CREATOR_ACTIVATION_CODE");
const VIP_PRO_MAX_CODE = Deno.env.get("VIP_PRO_MAX_ACTIVATION_CODE");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { role, code } = await req.json();
    if (!["vip", "creator", "vip_pro_max"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expected =
      role === "vip" ? VIP_CODE :
      role === "creator" ? CREATOR_CODE :
      VIP_PRO_MAX_CODE;

    if (!expected) {
      console.error(`Activation code env var for role '${role}' is not set`);
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey);

    let matched = typeof code === "string" && code === expected;
    let singleUseId: string | null = null;

    // If master password didn't match, try single-use activation codes from DB
    if (!matched && typeof code === "string" && code.length > 0) {
      const { data: codeRow } = await admin
        .from("activation_codes")
        .select("id, role")
        .eq("code", code)
        .eq("role", role)
        .maybeSingle();

      if (codeRow) {
        matched = true;
        singleUseId = codeRow.id;
      }
    }

    if (!matched) {
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rolesToInsert = role === "vip_pro_max"
      ? [{ user_id: userData.user.id, role: "vip" }, { user_id: userData.user.id, role: "vip_pro_max" }]
      : [{ user_id: userData.user.id, role }];

    for (const r of rolesToInsert) {
      const { error: insertErr } = await admin.from("user_roles").insert(r);
      if (insertErr && !insertErr.message.includes("duplicate")) {
        console.error("activate-role insert failed:", insertErr);
        return new Response(JSON.stringify({ error: "Role activation failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // If a single-use code was used, delete it so it can't be reused
    if (singleUseId) {
      await admin.from("activation_codes").delete().eq("id", singleUseId);
    }



    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("activate-role error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
