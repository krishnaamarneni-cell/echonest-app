'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { User, LogOut, Save, Lock, Unlock, UserPlus } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useOwnerMode } from '@/store/ownerMode';

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const { isOwner, hydrate, unlock, lock } = useOwnerMode();
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [ownerLoading, setOwnerLoading] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email || '');
        supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single()
          .then(({ data }) => {
            if (data?.display_name) setDisplayName(data.display_name);
          });
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerPassword) return;
    setOwnerError('');
    setOwnerLoading(true);
    const ok = await unlock(ownerPassword);
    setOwnerLoading(false);
    if (ok) {
      setOwnerPassword('');
    } else {
      setOwnerError('Wrong password');
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-lg mx-auto space-y-8 animate-fade-in">
      <h1 className="text-3xl font-bold">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <User className="w-5 h-5 text-accent" />
          Profile
        </h2>
        <Input
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input label="Email" value={email} disabled />
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </section>

      {/* Owner mode */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {isOwner ? (
            <Unlock className="w-5 h-5 text-success" />
          ) : (
            <Lock className="w-5 h-5 text-muted" />
          )}
          Owner mode
        </h2>

        {isOwner ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Owner mode is <span className="text-success font-medium">enabled</span>.
              Delete buttons are visible across the app.
            </p>
            <Button variant="secondary" onClick={lock}>
              <Lock className="w-4 h-4" />
              Disable owner mode
            </Button>
          </div>
        ) : (
          <form onSubmit={handleUnlock} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the owner password to enable delete options across the app.
              Visitors will only be able to add and play music.
            </p>
            <Input
              type="password"
              placeholder="Owner password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
            />
            {ownerError && (
              <p className="text-sm text-destructive">{ownerError}</p>
            )}
            <Button type="submit" disabled={ownerLoading || !ownerPassword}>
              <Unlock className="w-4 h-4" />
              {ownerLoading ? 'Checking...' : 'Enable owner mode'}
            </Button>
          </form>
        )}
      </section>

      {/* Make your own account */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-accent" />
          Want your own library?
        </h2>
        <p className="text-sm text-muted-foreground">
          Sign up for a separate account where you control everything.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/signup"
            className="px-4 py-2 bg-card border border-border text-sm rounded-full hover:bg-card-hover transition-colors"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">About</h2>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <Logo size="sm" />
          <div>
            <p className="text-sm font-medium">EchoNest v1.0</p>
            <p className="text-xs text-muted-foreground">
              Your personal music streaming app
            </p>
          </div>
        </div>
      </section>

      <section className="pt-4 border-t border-border">
        <Button variant="danger" onClick={handleLogout}>
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </section>
    </div>
  );
}
