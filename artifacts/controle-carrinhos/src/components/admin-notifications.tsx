import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { SectionCard } from "@/components/app-ui";
import {
  notificationDefinitions,
  useNotificationSettings,
  type NotificationGroup,
} from "@/lib/notification-settings";

const groups: {
  id: NotificationGroup;
  title: string;
  description: string;
}[] = [
  {
    id: "ti",
    title: "TI",
    description: "Avisos operacionais exibidos aos perfis de TI e administração.",
  },
  {
    id: "teachers",
    title: "Professores",
    description: "Avisos e notificações destinados aos professores.",
  },
];

function NotificationToggle({
  group,
  notification,
  label,
}: {
  group: NotificationGroup;
  notification: string;
  label: string;
}) {
  const {
    settings,
    loading,
    savingNotification,
    updateNotification,
  } = useNotificationSettings();
  const [saveError, setSaveError] = useState("");
  const enabled = settings[group][notification] ?? true;
  const saving = savingNotification === `${group}:${notification}`;

  const toggle = async () => {
    setSaveError("");
    try {
      await updateNotification(group, notification, !enabled);
    } catch (toggleError) {
      setSaveError(
        toggleError instanceof Error
          ? toggleError.message
          : "Não foi possível salvar a alteração.",
      );
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {enabled ? (
            <Bell size={15} className="shrink-0 text-[hsl(var(--primary))]" />
          ) : (
            <BellOff size={15} className="shrink-0 text-[hsl(var(--muted-foreground))]" />
          )}
          <span>{label}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Notificação ${label} para ${group === "ti" ? "TI" : "Professores"}`}
          disabled={loading || savingNotification !== null}
          onClick={() => void toggle()}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${
            enabled
              ? "bg-[hsl(var(--primary))]"
              : "bg-[hsl(var(--muted-foreground)/.45)]"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {saveError && (
        <p role="alert" className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-sm text-[hsl(var(--destructive))]">
          {saveError}
        </p>
      )}
    </div>
  );
}

function NotificationGroupCard({
  group,
}: {
  group: (typeof groups)[number];
}) {
  const { settings } = useNotificationSettings();
  const notifications = notificationDefinitions[group.id];
  const enabledCount = notifications.filter(
    ({ id }) => settings[group.id][id] ?? true,
  ).length;

  return (
    <SectionCard
      title={group.title}
      eyebrow={`${enabledCount} de ${notifications.length} notificações ativadas`}
    >
      <div className="space-y-4 p-5 sm:p-6">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {group.description}
        </p>
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <NotificationToggle
                group={group.id}
                notification={notification.id}
                label={notification.label}
              />
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}

export function AdminNotifications() {
  const { error, loading, refresh } = useNotificationSettings();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold">Central de Notificações</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Ative ou inative cada notificação individualmente para TI e professores.
        </p>
      </div>
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-sm text-[hsl(var(--destructive))]">
          <span>{error}</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => void refresh()}
            className="font-semibold underline disabled:opacity-60"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {loading && <p role="status" className="text-sm text-[hsl(var(--muted-foreground))]">Carregando configurações...</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((group) => (
          <NotificationGroupCard key={group.id} group={group} />
        ))}
      </div>
    </div>
  );
}
