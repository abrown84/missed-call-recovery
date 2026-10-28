// @ts-nocheck
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Mail, Lock, Building2, Loader2, Check, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '@/components/theme-provider';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          business_name: businessName,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      <button
        type="button"
        onClick={toggleTheme}
        className="btn-ghost absolute top-4 right-4"
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      {success ? (
        <div className="sm:mx-auto sm:w-full sm:max-w-md animate-fade-in">
          <div className="glass-card py-8 px-5 sm:px-10 rounded-2xl text-center">
            <div className="mx-auto w-12 h-12 bg-success/15 border border-success/30 rounded-full flex items-center justify-center mb-4">
              <Check className="w-6 h-6 text-success" aria-hidden />
            </div>
            <h1 className="text-xl font-semibold">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to <strong className="text-foreground">{email}</strong>
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Click the link in the email to activate your account.
            </p>
            <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline font-medium">
              Back to login
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="sm:mx-auto sm:w-full sm:max-w-md animate-fade-in">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-2xl bg-surface border border-border/60 flex items-center justify-center p-2 shadow-soft">
                <Image src="/logo.png" alt="" width={40} height={34} />
              </div>
            </div>
            <h1 className="mt-6 text-center text-3xl font-bold font-display text-balance">
              Start recovering missed calls
            </h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Create your account to get started
            </p>
          </div>

          <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-slide-up">
            <div className="glass-card py-8 px-5 sm:px-10 rounded-2xl">
              <form onSubmit={handleSignup} className="space-y-5">
                {error && (
                  <div
                    className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-sm text-danger"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="businessName" className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Business name
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden />
                    <input
                      id="businessName"
                      name="businessName"
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="field-input pl-11"
                      placeholder="ABC Plumbing"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="field-input pl-11"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden />
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="field-input pl-11"
                      placeholder="Min. 6 characters"
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create account'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
