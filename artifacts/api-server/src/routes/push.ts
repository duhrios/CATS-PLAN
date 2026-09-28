import { count, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";

type PushSubscription = webpush.PushSubscription;

const router: IRouter = Router();
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

router.get("/push/public-key", (_req, res) => {
  if (!vapidPublicKey) return res.status(503).json({ error: "Notificações push não configuradas no servidor." });
  return res.json({ publicKey: vapidPublicKey });
});

router.post("/push/subscriptions", async (req, res) => {
  const subscription = req.body as Partial<PushSubscription>;
  if (!subscription.endpoint || !subscription.keys?.auth || !subscription.keys.p256dh) {
    return res.status(400).json({ error: "Subscription push inválida." });
  }
  await db.insert(pushSubscriptionsTable).values({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  }).onConflictDoUpdate({
    target: pushSubscriptionsTable.endpoint,
    set: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      updatedAt: new Date(),
    },
  });
  return res.status(201).json({ registered: true });
});

router.delete("/push/subscriptions", async (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (endpoint) await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
  return res.status(204).send();
});

router.get("/push/status", async (req, res) => {
  if (!process.env.PUSH_ADMIN_TOKEN || req.header("authorization") !== `Bearer ${process.env.PUSH_ADMIN_TOKEN}`) {
    return res.status(401).json({ error: "Não autorizado." });
  }
  const [{ registered }] = await db
    .select({ registered: count() })
    .from(pushSubscriptionsTable);
  return res.json({
    configured: Boolean(vapidPublicKey && vapidPrivateKey),
    registered,
  });
});

router.post("/push/send", async (req, res) => {
  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(503).json({ error: "Notificações push não configuradas no servidor." });
  }
  if (!process.env.PUSH_ADMIN_TOKEN || req.header("authorization") !== `Bearer ${process.env.PUSH_ADMIN_TOKEN}`) {
    return res.status(401).json({ error: "Não autorizado." });
  }
  const payload = JSON.stringify({
    title: typeof req.body?.title === "string" ? req.body.title : "Controle de Carrinhos",
    body: typeof req.body?.body === "string" ? req.body.body : "Você tem uma nova atualização.",
    url: typeof req.body?.url === "string" ? req.body.url : "/",
  });
  let sent = 0;
  const subscriptions = await db.select().from(pushSubscriptionsTable);
  for (const subscription of subscriptions) {
    const pushSubscription: PushSubscription = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    };
    try {
      await webpush.sendNotification(pushSubscription, payload);
      sent += 1;
    } catch (error) {
      const statusCode = error instanceof webpush.WebPushError ? error.statusCode : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, subscription.endpoint));
      }
    }
  }
  const registered = (await db.select().from(pushSubscriptionsTable)).length;
  return res.json({ sent, registered });
});

export default router;
