'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import {
  ArrowLeft,
  Building2,
  Phone,
  Bell,
  Clock,
  MessageSquare,
  Zap,
  Save,
  Loader2,
  Check,
  AlertTriangle,
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
  smsTemplate: "Hi, this is {business_name}. We noticed we missed your call. What plumbing issue can we help you with today?",
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<BusinessSettings>(DEMO_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'business' | 'notifications' | 'sms'>('business');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // TODO: Fetch actual settings from API
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
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
    { id: 'business', label: 'Business', icon: Building2 },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'sms', label: 'SMS Templates', icon: MessageSquare },
  ] as const;

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10">
        {/* Header */}
        <header className="glass-card border-b border-[#E5DADA]/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.push('/')}
                  className="p-2 rounded-lg hover:bg-[#E5DADA]/10 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-[#E5DADA]/70" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#002642]/60 border border-[#E5DADA]/10 flex items-center justify-center p-1.5">
                    <Image
                      src="/logo.png"
                      alt="Missed Call Recovery"
                      width={32}
                      height={28}
                      className="drop-shadow-md"
                    />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-[#E5DADA]">Settings</h1>
                    <p className="text-sm text-[#E5DADA]/60">Configure your business</p>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold',
                  'bg-gradient-to-r from-[#E59500] to-[#840032]',
                  'text-white shadow-lg',
                  'hover:shadow-[0_0_30px_rgba(229,149,0,0.3)]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-all duration-200'
                )}
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {saveSuccess ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Tabs */}
          <div className="glass-card rounded-2xl p-2 mb-6 flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all duration-200',
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-[#E59500]/20 to-[#840032]/20 text-[#E5DADA] border border-[#E59500]/30'
                    : 'text-[#E5DADA]/60 hover:text-[#E5DADA] hover:bg-[#E5DADA]/5'
                )}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Business Settings Tab */}
          {activeTab === 'business' && (
            <div className="space-y-6 animate-fade-in">
              {/* Business Info */}
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-bold text-[#E5DADA] mb-6 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#E59500]" />
                  Business Information
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Business Name</label>
                    <input
                      type="text"
                      value={settings.name}
                      onChange={(e) => updateSetting('name', e.target.value)}
                      className="settings-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Phone Number</label>
                    <input
                      type="tel"
                      value={settings.phone}
                      onChange={(e) => updateSetting('phone', e.target.value)}
                      className="settings-input font-['JetBrains_Mono']"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Industry</label>
                    <select
                      value={settings.vertical}
                      onChange={(e) => updateSetting('vertical', e.target.value)}
                      className="settings-input cursor-pointer"
                    >
                      {VERTICALS.map((v) => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Timezone</label>
                    <select
                      value={settings.timezone}
                      onChange={(e) => updateSetting('timezone', e.target.value)}
                      className="settings-input cursor-pointer"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Business Hours */}
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-bold text-[#E5DADA] mb-6 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#E59500]" />
                  Business Hours
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Opens At</label>
                    <input
                      type="time"
                      value={settings.businessHoursStart}
                      onChange={(e) => updateSetting('businessHoursStart', e.target.value)}
                      className="settings-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Closes At</label>
                    <input
                      type="time"
                      value={settings.businessHoursEnd}
                      onChange={(e) => updateSetting('businessHoursEnd', e.target.value)}
                      className="settings-input"
                    />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between p-4 rounded-xl bg-[#002642]/50 border border-[#E5DADA]/10">
                  <div>
                    <div className="font-medium text-[#E5DADA]">After-Hours Recovery</div>
                    <div className="text-sm text-[#E5DADA]/60">Send recovery SMS outside business hours</div>
                  </div>
                  <button
                    onClick={() => updateSetting('afterHoursEnabled', !settings.afterHoursEnabled)}
                    className={cn(
                      'relative w-14 h-8 rounded-full transition-colors duration-200',
                      settings.afterHoursEnabled
                        ? 'bg-gradient-to-r from-[#E59500] to-[#840032]'
                        : 'bg-[#002642]'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg transition-all duration-200',
                        settings.afterHoursEnabled ? 'left-7' : 'left-1'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Emergency Settings */}
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-bold text-[#E5DADA] mb-6 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[#840032]" />
                  Emergency Escalation
                </h2>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Emergency Phone (for escalations)</label>
                    <input
                      type="tel"
                      value={settings.emergencyPhone}
                      onChange={(e) => updateSetting('emergencyPhone', e.target.value)}
                      className="settings-input font-['JetBrains_Mono']"
                      placeholder="+1 555 987 6543"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-[#840032]/10 border border-[#840032]/30">
                    <div>
                      <div className="font-medium text-[#E5DADA]">Auto-Escalate Emergencies</div>
                      <div className="text-sm text-[#E5DADA]/60">Immediately escalate emergency-classified leads</div>
                    </div>
                    <button
                      onClick={() => updateSetting('autoEscalateEmergencies', !settings.autoEscalateEmergencies)}
                      className={cn(
                        'relative w-14 h-8 rounded-full transition-colors duration-200',
                        settings.autoEscalateEmergencies
                          ? 'bg-gradient-to-r from-[#E59500] to-[#840032]'
                          : 'bg-[#002642]'
                      )}
                    >
                      <div
                        className={cn(
                          'absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg transition-all duration-200',
                          settings.autoEscalateEmergencies ? 'left-7' : 'left-1'
                        )}
                      />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Escalation Delay (minutes)</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={settings.escalationDelayMinutes}
                      onChange={(e) => updateSetting('escalationDelayMinutes', parseInt(e.target.value) || 5)}
                      className="settings-input w-32"
                    />
                    <p className="text-xs text-[#E5DADA]/50">
                      Time to wait before escalating non-emergency high-priority leads
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-fade-in">
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-bold text-[#E5DADA] mb-6 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-[#E59500]" />
                  Notification Preferences
                </h2>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-[#002642]/50 border border-[#E5DADA]/10">
                    <div>
                      <div className="font-medium text-[#E5DADA]">New Lead Notifications</div>
                      <div className="text-sm text-[#E5DADA]/60">Get notified when a new missed call is received</div>
                    </div>
                    <button
                      onClick={() => updateSetting('notifyOnNewLead', !settings.notifyOnNewLead)}
                      className={cn(
                        'relative w-14 h-8 rounded-full transition-colors duration-200',
                        settings.notifyOnNewLead
                          ? 'bg-gradient-to-r from-[#E59500] to-[#840032]'
                          : 'bg-[#002642]'
                      )}
                    >
                      <div
                        className={cn(
                          'absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg transition-all duration-200',
                          settings.notifyOnNewLead ? 'left-7' : 'left-1'
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-[#840032]/10 border border-[#840032]/30">
                    <div>
                      <div className="font-medium text-[#E5DADA] flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#840032]" />
                        Escalation Notifications
                      </div>
                      <div className="text-sm text-[#E5DADA]/60">Get notified when a lead is escalated</div>
                    </div>
                    <button
                      onClick={() => updateSetting('notifyOnEscalation', !settings.notifyOnEscalation)}
                      className={cn(
                        'relative w-14 h-8 rounded-full transition-colors duration-200',
                        settings.notifyOnEscalation
                          ? 'bg-gradient-to-r from-[#E59500] to-[#840032]'
                          : 'bg-[#002642]'
                      )}
                    >
                      <div
                        className={cn(
                          'absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg transition-all duration-200',
                          settings.notifyOnEscalation ? 'left-7' : 'left-1'
                        )}
                      />
                    </button>
                  </div>

                  <div className="space-y-2 pt-4">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Notification Email</label>
                    <input
                      type="email"
                      value={settings.notifyEmail}
                      onChange={(e) => updateSetting('notifyEmail', e.target.value)}
                      className="settings-input"
                      placeholder="owner@business.com"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SMS Templates Tab */}
          {activeTab === 'sms' && (
            <div className="space-y-6 animate-fade-in">
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-bold text-[#E5DADA] mb-6 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#E59500]" />
                  Recovery SMS Template
                </h2>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#E5DADA]/70">Initial Outreach Message</label>
                    <textarea
                      value={settings.smsTemplate}
                      onChange={(e) => updateSetting('smsTemplate', e.target.value)}
                      rows={4}
                      className="settings-input resize-none"
                      placeholder="Enter your recovery SMS template..."
                    />
                    <p className="text-xs text-[#E5DADA]/50">
                      Available variables: {'{business_name}'}, {'{caller_phone}'}
                    </p>
                  </div>

                  {/* Template Preview */}
                  <div className="p-4 rounded-xl bg-[#002642]/50 border border-[#E5DADA]/10">
                    <div className="text-xs font-medium text-[#E5DADA]/60 uppercase tracking-wide mb-2">
                      Preview
                    </div>
                    <div className="text-sm text-[#E5DADA]">
                      {settings.smsTemplate.replace('{business_name}', settings.name)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Character Count */}
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#E5DADA]/60">Character count</span>
                  <span className={cn(
                    'font-medium font-["JetBrains_Mono"]',
                    settings.smsTemplate.length > 160 ? 'text-[#E59500]' : 'text-[#E5DADA]'
                  )}>
                    {settings.smsTemplate.length} / 160
                  </span>
                </div>
                {settings.smsTemplate.length > 160 && (
                  <p className="text-xs text-[#E59500] mt-2">
                    Messages over 160 characters will be split into multiple SMS segments
                  </p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx global>{`
        .settings-input {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 0.75rem;
          background: rgba(0, 38, 66, 0.5);
          border: 1px solid rgba(229, 218, 218, 0.1);
          color: #E5DADA;
          font-size: 0.875rem;
          transition: all 0.2s;
        }

        .settings-input:focus {
          outline: none;
          border-color: rgba(229, 149, 0, 0.5);
          box-shadow: 0 0 0 2px rgba(229, 149, 0, 0.1);
        }

        .settings-input::placeholder {
          color: rgba(229, 218, 218, 0.4);
        }

        .settings-input option {
          background: #002642;
          color: #E5DADA;
        }
      `}</style>
    </div>
  );
}
