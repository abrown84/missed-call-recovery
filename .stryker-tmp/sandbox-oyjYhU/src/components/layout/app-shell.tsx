// @ts-nocheck
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: '5xl' | '7xl' | '4xl';
  actions?: React.ReactNode;
  showNav?: boolean;
}

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({
  children,
  title = 'Missed Call Recovery',
  subtitle = 'ABC Plumbing',
  maxWidth = '7xl',
  actions,
  showNav = true,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then((result: { data: { user: { email?: string } | null } }) => {
      setUserEmail(result.data?.user?.email || null);
    });
  }, [supabase.auth]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const widthClass =
    maxWidth === '4xl' ? 'max-w-4xl' : maxWidth === '5xl' ? 'max-w-5xl' : 'max-w-7xl';

  return (
    <div className="min-h-screen relative">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="relative z-10">
        <header className="sticky top-0 z-40 glass-card border-b border-border/40">
          <div className={cn(widthClass, 'mx-auto px-4 sm:px-6 lg:px-8')}>
            <div className="flex items-center justify-between h-16 sm:h-[4.5rem] gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {showNav && (
                  <button
                    type="button"
                    className="btn-ghost lg:hidden"
                    aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={mobileOpen}
                    onClick={() => setMobileOpen((v) => !v)}
                  >
                    {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                )}

                <Link href="/" className="flex items-center gap-3 min-w-0 group">
                  <div className="w-10 h-10 rounded-xl bg-surface border border-border/60 flex items-center justify-center p-1.5 shrink-0">
                    <Image
                      src="/logo.png"
                      alt=""
                      width={32}
                      height={28}
                      className="drop-shadow-sm"
                    />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-base sm:text-lg font-bold truncate group-hover:text-primary transition-colors">
                      {title}
                    </h1>
                    {subtitle && (
                      <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                        <Activity className="w-3 h-3 shrink-0" aria-hidden />
                        {subtitle}
                      </p>
                    )}
                  </div>
                </Link>
              </div>

              {showNav && (
                <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
                  {NAV.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary/15 text-primary border border-primary/30'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <item.icon className="w-4 h-4" aria-hidden />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              )}

              <div className="flex items-center gap-1.5 sm:gap-2">
                {actions}

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="btn-ghost"
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                {userEmail && (
                  <span className="hidden md:inline text-sm text-muted-foreground truncate max-w-[140px]">
                    {userEmail}
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn-ghost"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>

            {showNav && mobileOpen && (
              <nav
                className="lg:hidden pb-4 flex flex-col gap-1 animate-fade-in"
                aria-label="Mobile"
              >
                {NAV.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium',
                        active
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'text-muted-foreground hover:bg-muted/60'
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
        </header>

        <main id="main-content" className={cn(widthClass, 'mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8')}>
          {children}
        </main>
      </div>
    </div>
  );
}
