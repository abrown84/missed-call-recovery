import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export type AuthResult =
  | { user: { id: string; email?: string }; error?: never }
  | { user?: never; error: NextResponse };

/**
 * Require an authenticated Supabase session for dashboard API routes.
 * Returns 401 JSON when the caller is not signed in.
 */
export async function requireApiUser(): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return {
      error: NextResponse.json(
        { error: 'Auth is not configured' },
        { status: 503 }
      ),
    };
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component context where cookies are read-only.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Called from a Server Component context where cookies are read-only.
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { user: { id: user.id, email: user.email } };
}
