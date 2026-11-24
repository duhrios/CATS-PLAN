CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"sender_role" text NOT NULL,
	"sender_name" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'Pendente' NOT NULL,
	"admin_response" text,
	"responded_by" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_account_id_campus_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."campus_users"("id") ON DELETE set null ON UPDATE no action;