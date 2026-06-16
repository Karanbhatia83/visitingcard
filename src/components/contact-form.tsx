'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DuplicateDialog, type ResolveChoice } from '@/components/duplicate-dialog';
import { Plus, X, Save, Loader2 } from 'lucide-react';
import type { ExtractedCard, DuplicateMatch } from '@/types';

type Mode = 'create' | 'edit';

interface Props {
  initial: ExtractedCard;
  mode: Mode;
  scanId?: string;
  contactId?: string;
}

function MultiField({
  label,
  values,
  onChange,
  inputMode,
  type = 'text',
  placeholder,
  addLabel,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  inputMode?: 'tel' | 'email' | 'url' | 'text';
  type?: string;
  placeholder?: string;
  addLabel: string;
}) {
  const rows = values.length ? values : [''];

  function update(i: number, val: string) {
    const next = [...rows];
    next[i] = val;
    onChange(next);
  }
  function remove(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length ? next : ['']);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        {rows.map((val, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={val}
              type={type}
              inputMode={inputMode}
              placeholder={placeholder}
              onChange={(e) => update(i, e.target.value)}
            />
            {rows.length > 1 || val ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label}`}
                onClick={() => remove(i)}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="self-start text-primary"
        onClick={() => onChange([...rows, ''])}
      >
        <Plus aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}

export function ContactForm({ initial, mode, scanId, contactId }: Props) {
  const router = useRouter();
  const [card, setCard] = useState<ExtractedCard>(initial);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  function set<K extends keyof ExtractedCard>(key: K, value: ExtractedCard[K]) {
    setCard((c) => ({ ...c, [key]: value }));
  }

  function clean(c: ExtractedCard): ExtractedCard {
    const arr = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
    return {
      ...c,
      fullName: c.fullName.trim(),
      company: c.company.trim(),
      designation: c.designation.trim(),
      website: c.website.trim(),
      linkedin: c.linkedin.trim(),
      address: c.address.trim(),
      notes: c.notes.trim(),
      mobileNumbers: arr(c.mobileNumbers),
      officeNumbers: arr(c.officeNumbers),
      emails: arr(c.emails),
    };
  }

  async function persist(choice?: ResolveChoice) {
    const payload = clean(card);
    setSaving(true);
    try {
      if (mode === 'edit' && contactId) {
        const res = await fetch(`/api/contacts/${contactId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Could not save changes.');
        notifySync(data?.contact?.syncStatus);
        toast.success('Contact updated.');
        router.push(`/contacts/${contactId}`);
        router.refresh();
        return;
      }

      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          scanId,
          resolution: choice?.resolution ?? 'create',
          updateGoogleResourceName: choice?.updateGoogleResourceName,
          updateLocalId: choice?.updateLocalId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save the contact.');
      notifySync(data?.contact?.syncStatus);
      toast.success('Contact saved.');
      router.push(`/contacts/${data.contact.id}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
      setDialogOpen(false);
    }
  }

  function notifySync(status?: string) {
    if (status === 'FAILED') {
      toast.warning('Saved on your device, but Google sync failed. You can retry from the contact.');
    } else if (status === 'LOCAL_ONLY') {
      toast.message('Saved on your device. Turn on Google sync in Settings to add it to Google.');
    }
  }

  async function handleSave() {
    const payload = clean(card);
    if (!payload.fullName) {
      toast.error('Please enter a name.');
      return;
    }

    // Edit mode skips duplicate detection.
    if (mode === 'edit') {
      await persist();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({ matches: [] }));
      const found: DuplicateMatch[] = data?.matches ?? [];
      if (found.length) {
        setMatches(found);
        setDialogOpen(true);
        setSaving(false);
        return;
      }
    } catch {
      // If duplicate lookup fails, fall through to a normal create.
    }
    await persist({ resolution: 'create' });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          value={card.fullName}
          autoCapitalize="words"
          placeholder="e.g. Karan Bhatia"
          onChange={(e) => set('fullName', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="company">Company</Label>
        <Input
          id="company"
          value={card.company}
          placeholder="Company name"
          onChange={(e) => set('company', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="designation">Designation</Label>
        <Input
          id="designation"
          value={card.designation}
          placeholder="Job title"
          onChange={(e) => set('designation', e.target.value)}
        />
      </div>

      <MultiField
        label="Mobile numbers"
        values={card.mobileNumbers}
        onChange={(v) => set('mobileNumbers', v)}
        inputMode="tel"
        type="tel"
        placeholder="+91 98xxxxxxxx"
        addLabel="Add mobile number"
      />

      <MultiField
        label="Office numbers"
        values={card.officeNumbers}
        onChange={(v) => set('officeNumbers', v)}
        inputMode="tel"
        type="tel"
        placeholder="Landline / office"
        addLabel="Add office number"
      />

      <MultiField
        label="Emails"
        values={card.emails}
        onChange={(v) => set('emails', v)}
        inputMode="email"
        type="email"
        placeholder="name@company.com"
        addLabel="Add email"
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="website">Website</Label>
        <Input
          id="website"
          value={card.website}
          inputMode="url"
          placeholder="company.com"
          onChange={(e) => set('website', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="linkedin">LinkedIn</Label>
        <Input
          id="linkedin"
          value={card.linkedin}
          inputMode="url"
          placeholder="linkedin.com/in/…"
          onChange={(e) => set('linkedin', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={card.address}
          rows={3}
          placeholder="Street, city, state"
          onChange={(e) => set('address', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={card.notes}
          rows={3}
          placeholder="Anything to remember about this person"
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <div className="sticky bottom-24 z-10 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button size="lg" className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {mode === 'edit' ? 'Save changes' : 'Save contact'}
        </Button>
      </div>

      <DuplicateDialog
        open={dialogOpen}
        matches={matches}
        saving={saving}
        onResolve={(choice) => persist(choice)}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}
