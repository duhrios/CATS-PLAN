import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { supportTicketsTable } from "@workspace/db/schema";
import { getAuthSession, requireAdmin, requireSameOrigin, requireSession } from "../lib/auth";

const router: IRouter = Router();
const categories = ["Bug", "Sugestão", "Dúvida"] as const;
const statuses = ["Pendente", "Respondido", "Resolvido"] as const;

router.get("/support/tickets", requireSession, async (req, res) => {
  const session = getAuthSession(req);
  if (!session) return res.status(401).json({ error: "Autenticação necessária." });

  const tickets = session.role === "admin"
    ? await db.select().from(supportTicketsTable).orderBy(desc(supportTicketsTable.createdAt))
    : await db.select()
        .from(supportTicketsTable)
        .where(and(
          eq(supportTicketsTable.accountId, session.accountId ?? -1),
          eq(supportTicketsTable.senderRole, session.role),
        ))
        .orderBy(desc(supportTicketsTable.createdAt));

  return res.json(tickets.map((ticket) => ({
    id: String(ticket.id),
    senderRole: ticket.senderRole,
    senderName: ticket.senderName,
    category: ticket.category,
    title: ticket.title,
    message: ticket.message,
    status: ticket.status,
    adminResponse: ticket.adminResponse,
    respondedBy: ticket.respondedBy,
    respondedAt: ticket.respondedAt,
    createdAt: ticket.createdAt,
  })));
});

router.post("/support/tickets", requireSameOrigin, requireSession, async (req, res) => {
  const session = getAuthSession(req);
  if (!session || (session.role !== "user" && session.role !== "operator")) {
    return res.status(403).json({ error: "Professores e usuários TI podem enviar chamados." });
  }
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "";
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!categories.includes(category as (typeof categories)[number])) {
    return res.status(400).json({ error: "Selecione Bug, Sugestão ou Dúvida." });
  }
  if (title.length < 3 || title.length > 120) {
    return res.status(400).json({ error: "O assunto deve ter entre 3 e 120 caracteres." });
  }
  if (message.length < 10 || message.length > 3000) {
    return res.status(400).json({ error: "Descreva a ocorrência com entre 10 e 3000 caracteres." });
  }

  const [ticket] = await db.insert(supportTicketsTable)
    .values({
      accountId: session.accountId ?? null,
      senderRole: session.role,
      senderName: session.name,
      category,
      title,
      message,
      status: "Pendente",
    })
    .returning();
  return res.status(201).json({
    id: String(ticket.id),
    senderRole: ticket.senderRole,
    senderName: ticket.senderName,
    category: ticket.category,
    title: ticket.title,
    message: ticket.message,
    status: ticket.status,
    adminResponse: ticket.adminResponse,
    respondedBy: ticket.respondedBy,
    respondedAt: ticket.respondedAt,
    createdAt: ticket.createdAt,
  });
});

router.put("/support/tickets/:id", requireSameOrigin, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Chamado inválido." });
  }
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  const adminResponse = typeof req.body?.adminResponse === "string"
    ? req.body.adminResponse.trim()
    : "";
  if (!statuses.includes(status as (typeof statuses)[number])) {
    return res.status(400).json({ error: "Situação inválida." });
  }
  if (adminResponse.length > 3000) {
    return res.status(400).json({ error: "A resposta pode ter no máximo 3000 caracteres." });
  }
  if ((status === "Respondido" || status === "Resolvido") && adminResponse.length < 3) {
    return res.status(400).json({ error: "Informe uma resposta antes de alterar a situação." });
  }
  const session = getAuthSession(req);
  const [ticket] = await db.update(supportTicketsTable)
    .set({
      status,
      adminResponse: adminResponse || null,
      respondedBy: adminResponse ? (session?.name ?? "Administrador") : null,
      respondedAt: adminResponse ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(supportTicketsTable.id, id))
    .returning();
  if (!ticket) return res.status(404).json({ error: "Chamado não encontrado." });
  return res.json({
    id: String(ticket.id),
    senderRole: ticket.senderRole,
    senderName: ticket.senderName,
    category: ticket.category,
    title: ticket.title,
    message: ticket.message,
    status: ticket.status,
    adminResponse: ticket.adminResponse,
    respondedBy: ticket.respondedBy,
    respondedAt: ticket.respondedAt,
    createdAt: ticket.createdAt,
  });
});

export default router;
