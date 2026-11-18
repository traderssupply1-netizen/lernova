"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/lib/i18n/hu";
import { saveProfileAction, type ProfileState } from "./actions";
import { Alert, Button, Input, Label, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { SessionContext } from "@/lib/auth";

const ZONES = ["Europe/Budapest", "Europe/London", "Europe/Dublin", "Europe/Berlin", "Europe/Paris", "Europe/Vienna", "Europe/Bucharest", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC"];

export function ProfileForm({ t, profile, email }: { t: Dictionary; profile: SessionContext["profile"]; email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfileAction, undefined);
  const zones = ZONES.includes(profile.timezone) ? ZONES : [profile.timezone, ...ZONES];
  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="full_name">{t.auth.fullName}</Label>
        <Input id="full_name" name="full_name" defaultValue={profile.full_name} maxLength={120} required />
      </div>
      <div>
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" value={email} disabled readOnly />
      </div>
      <div>
        <Label htmlFor="ui_language">{t.settings.uiLanguage}</Label>
        <Select id="ui_language" name="ui_language" defaultValue={profile.ui_language}>
          <option value="hu">Magyar</option>
          <option value="en">English</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="ai_language">{t.settings.aiLanguage}</Label>
        <Select id="ai_language" name="ai_language" defaultValue={profile.ai_language}>
          <option value="hu">Magyar</option>
          <option value="en">English</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="timezone">{t.settings.timezone}</Label>
        <Select id="timezone" name="timezone" defaultValue={profile.timezone}>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="country">{t.settings.country}</Label>
        <Input id="country" name="country" defaultValue={profile.country ?? ""} maxLength={2} className="uppercase" />
      </div>
      <div>
        <Label htmlFor="daily_goal_minutes">{t.dashboard.todayMinutes} ({t.common.minutes})</Label>
        <Input id="daily_goal_minutes" name="daily_goal_minutes" type="number" min={5} max={600} defaultValue={profile.daily_goal_minutes} />
      </div>
      <label className="flex items-start gap-3 text-sm text-muted sm:col-span-2">
        <input type="checkbox" name="training_consent" defaultChecked={profile.training_consent} className="mt-0.5 size-4 accent-[var(--color-lime)]" />
        <span>{t.settings.trainingConsent}</span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" loading={pending}>{t.common.save}</Button>
        {state?.ok && <span className="text-sm text-ok">{t.common.saved}</span>}
        {state?.error && <Alert tone="error">{t.common.somethingWrong}</Alert>}
      </div>
    </form>
  );
}

export function DeleteAccount({ t }: { t: Dictionary }) {
  return (
    <div>
      <p className="text-sm font-medium text-danger">{t.settings.deleteAccount}</p>
      <p className="mt-1 text-sm text-muted">{t.settings.deleteAccountBody}</p>
      <ConfirmDialog
        title={t.settings.deleteAccount}
        body={<>{t.settings.deleteAccountBody} {t.common.cannotUndo}</>}
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        requireWord={t.settings.deleteConfirmWord}
        requireWordLabel={t.settings.deleteConfirmLabel}
        onConfirm={async () => {
          const res = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: t.settings.deleteConfirmWord }) });
          if (res.ok) window.location.assign(new URL("/", window.location.origin).toString()); // full reload clears session state
          else alert(t.common.somethingWrong);
        }}
        trigger={(open) => <Button variant="danger" size="sm" className="mt-3" onClick={open}>{t.settings.deleteAccount}</Button>}
      />
    </div>
  );
}
