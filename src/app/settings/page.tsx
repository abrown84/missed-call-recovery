'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { cn } from '@/lib/utils';
import {
  Building2,
  Bell,
  Clock,
  MessageSquare,
  Zap,
  Save,
  Loader2,
  Check,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';

interface BusinessSettings {
  name: string;
  phone: string;
  vertical: string;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  afterHoursEnabled: boolean;
  emergencyPhone: string;
  smsTemplate: string;
  autoEscalateEmergencies: boolean;
  escalationDelayMinutes: number;
  notifyOnNewLead: boolean;
  notifyOnEscalation: boolean;
  notifyEmail: string;
}

const DEMO_SETTINGS: BusinessSettings = {
  name: 'ABC Plumbing',
  phone: '+15551234567',
  vertical: 'plumbing',
  timezone: 'America/New_York',
  businessHoursStart: '08:00',
  businessHoursEnd: '18:00',
  afterHoursEnabled: true,
  emergencyPhone: '+15559876543',
  smsTemplate:
    "Hi, this is {business_name}. We noticed we missed your call. What plumbing issue can we help you with today?",
  autoEscalateEmergencies: true,
  escalationDelayMinutes: 5,
  notifyOnNewLead: true,
  notifyOnEscalation: true,
  notifyEmail: 'owner@abcplumbing.com',
};

const VERTICALS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'restoration', label: 'Restoration' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'general', label: 'General Contractor' },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
];

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0',
        checked ? 'bg-gradient-to-r from-primary to-accent' : 'bg-muted border border-border'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all duration-200',
          checked ? 'left-5' : 'left-0.5'
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<BusinessSettings>(DEMO_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'business' | 'notifications' | 'sms'>('business');
  const router = useRouter();

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const updateSetting = <K extends keyof BusinessSettings>(
    key: K,
    value: BusinessSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: 'business' as const, label: 'Business', icon: Building2 },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'sms' as const, label: 'SMS', icon: MessageSquare },
  ];

  return (
    <AppShell
      title="Settings"
      subtitle="Configure your business"
      maxWidth="4xl"
      actions={
        <>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="btn-ghost sm:hidden"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-5 h-5" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">{saveSuccess ? 'Saved!' : 'Save changes'}</span>
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div
          className="glass-card rounded-2xl p-1.5 flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Settings sections"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 min-w-[7rem] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                activeTab === tab.id
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <tab.icon className="w-4 h-4" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'business' && (
          <div className="space-y-5 animate-fade-in" role="tabpanel">
            <section className="glass-card rounded-2xl p-5 sm:p-6">
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" aria-hidden />
                Business information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label htmlFor="biz-name" className="text-sm font-medium text-muted-foreground">Business name</label>
                  <input id="biz-name" type="text" value={settings.name} onChange={(e) => updateSetting('name', e.target.value)} className="field-input" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="biz-phone" className="text-sm font-medium text-muted-foreground">Phone number</label>
                  <input id="biz-phone" type="tel" value={settings.phone} onChange={(e) => updateSetting('phone', e.target.value)} className="field-input font-mono" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="biz-vertical" className="text-sm font-medium text-muted-foreground">Industry</label>
                  <select id="biz-vertical" value={settings.vertical} onChange={(e) => updateSetting('vertical', e.target.value)} className="field-input cursor-pointer">
                    {VERTICALS.map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="biz-tz" className="text-sm font-medium text-muted-foreground">Timezone</label>
                  <select id="biz-tz" value={settings.timezone} onChange={(e) => updateSetting('timezone', e.target.value)} className="field-input cursor-pointer">
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="glass-card rounded-2xl p-5 sm:p-6">
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" aria-hidden />
                Business hours
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label htmlFor="opens" className="text-sm font-medium text-muted-foreground">Opens at</label>
                  <input id="opens" type="time" value={settings.businessHoursStart} onChange={(e) => updateSetting('businessHoursStart', e.target.value)} className="field-input" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="closes" className="text-sm font-medium text-muted-foreground">Closes at</label>
                  <input id="closes" type="time" value={settings.businessHoursEnd} onChange={(e) => updateSetting('businessHoursEnd', e.target.value)} className="field-input" />
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between gap-4 p-4 rounded-xl bg-surface/70 border border-border/50">
                <div>
                  <div className="font-medium">After-hours recovery</div>
                  <div className="text-sm text-muted-foreground">Send recovery SMS outside business hours</div>
                </div>
                <Toggle
                  checked={settings.afterHoursEnabled}
                  onChange={() => updateSetting('afterHoursEnabled', !settings.afterHoursEnabled)}
                  label="After-hours recovery"
                />
              </div>
            </section>

            <section className="glass-card rounded-2xl p-5 sm:p-6">
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <Zap className="w-5 h-5 text-accent" aria-hidden />
                Emergency escalation
              </h2>
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="emergency-phone" className="text-sm font-medium text-muted-foreground">Emergency phone</label>
                  <input id="emergency-phone" type="tel" value={settings.emergencyPhone} onChange={(e) => updateSetting('emergencyPhone', e.target.value)} className="field-input font-mono" placeholder="+1 555 987 6543" />
                </div>
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-accent/10 border border-accent/25">
                  <div>
                    <div className="font-medium">Auto-escalate emergencies</div>
                    <div className="text-sm text-muted-foreground">Immediately escalate emergency-classified leads</div>
                  </div>
                  <Toggle
                    checked={settings.autoEscalateEmergencies}
                    onChange={() => updateSetting('autoEscalateEmergencies', !settings.autoEscalateEmergencies)}
                    label="Auto-escalate emergencies"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="escalation-delay" className="text-sm font-medium text-muted-foreground">Escalation delay (minutes)</label>
                  <input id="escalation-delay" type="number" min={1} max={60} value={settings.escalationDelayMinutes} onChange={(e) => updateSetting('escalationDelayMinutes', parseInt(e.target.value) || 5)} className="field-input w-32" />
                  <p className="text-xs text-muted-foreground">Wait before escalating non-emergency high-priority leads</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="space-y-5 animate-fade-in" role="tabpanel">
            <section className="glass-card rounded-2xl p-5 sm:p-6">
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" aria-hidden />
                Notification preferences
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-surface/70 border border-border/50">
                  <div>
                    <div className="font-medium">New lead notifications</div>
                    <div className="text-sm text-muted-foreground">When a missed call is received</div>
                  </div>
                  <Toggle checked={settings.notifyOnNewLead} onChange={() => updateSetting('notifyOnNewLead', !settings.notifyOnNewLead)} label="New lead notifications" />
                </div>
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-accent/10 border border-accent/25">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-accent" aria-hidden />
                      Escalation notifications
                    </div>
                    <div className="text-sm text-muted-foreground">When a lead is escalated</div>
                  </div>
                  <Toggle checked={settings.notifyOnEscalation} onChange={() => updateSetting('notifyOnEscalation', !settings.notifyOnEscalation)} label="Escalation notifications" />
                </div>
                <div className="space-y-1.5 pt-2">
                  <label htmlFor="notify-email" className="text-sm font-medium text-muted-foreground">Notification email</label>
                  <input id="notify-email" type="email" value={settings.notifyEmail} onChange={(e) => updateSetting('notifyEmail', e.target.value)} className="field-input" placeholder="owner@business.com" />
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'sms' && (
          <div className="space-y-5 animate-fade-in" role="tabpanel">
            <section className="glass-card rounded-2xl p-5 sm:p-6">
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" aria-hidden />
                Recovery SMS template
              </h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="sms-template" className="text-sm font-medium text-muted-foreground">Initial outreach message</label>
                  <textarea
                    id="sms-template"
                    value={settings.smsTemplate}
                    onChange={(e) => updateSetting('smsTemplate', e.target.value)}
                    rows={4}
                    className="field-input resize-none"
                    placeholder="Enter your recovery SMS template…"
                  />
                  <p className="text-xs text-muted-foreground">
                    Variables: {'{business_name}'}, {'{caller_phone}'}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-surface/70 border border-border/50">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Preview</div>
                  <div className="text-sm">{settings.smsTemplate.replace('{business_name}', settings.name)}</div>
                </div>
              </div>
            </section>
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Character count</span>
                <span className={cn('font-medium font-mono', settings.smsTemplate.length > 160 ? 'text-primary' : 'text-foreground')}>
                  {settings.smsTemplate.length} / 160
                </span>
              </div>
              {settings.smsTemplate.length > 160 && (
                <p className="text-xs text-primary mt-2">
                  Messages over 160 characters will be split into multiple SMS segments
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
