CREATE TABLE "campus_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campus_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_schedule_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" integer NOT NULL,
	"period" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "chromebook_cart_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" integer NOT NULL,
	"asset_tag" text NOT NULL,
	"unavailable" boolean DEFAULT false NOT NULL,
	"reserved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chromebook_carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"location" text DEFAULT 'Central de tecnologia' NOT NULL,
	"status" text DEFAULT 'Pronto' NOT NULL,
	"unavailable" boolean DEFAULT false NOT NULL,
	"total_devices" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_day_locks" (
	"scheduled_date" date PRIMARY KEY NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"lock_time" time DEFAULT '07:00' NOT NULL,
	"updated_by" text DEFAULT 'Administrador' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_id" integer NOT NULL,
	"status" text DEFAULT 'Não movido' NOT NULL,
	"actor" text,
	"not_received" boolean DEFAULT false NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_reservation_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_id" integer NOT NULL,
	"unit_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacher_id" integer,
	"teacher_name" text NOT NULL,
	"segment" text NOT NULL,
	"subject" text NOT NULL,
	"class_name" text NOT NULL,
	"room" text NOT NULL,
	"period" text NOT NULL,
	"scheduled_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"cart_id" integer NOT NULL,
	"kind" text DEFAULT 'Aula' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'Aguardando' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campus_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"password_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wifi_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"point" text NOT NULL,
	"type" text NOT NULL,
	"location" text NOT NULL,
	"status" text DEFAULT 'Disponível' NOT NULL,
	"assigned_room" text,
	"observations" text
);
--> statement-breakpoint
ALTER TABLE "cart_schedule_slots" ADD CONSTRAINT "cart_schedule_slots_cart_id_chromebook_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."chromebook_carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chromebook_cart_units" ADD CONSTRAINT "chromebook_cart_units_cart_id_chromebook_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."chromebook_carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_movements" ADD CONSTRAINT "cart_movements_reservation_id_cart_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."cart_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_reservation_units" ADD CONSTRAINT "cart_reservation_units_reservation_id_cart_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."cart_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_reservation_units" ADD CONSTRAINT "cart_reservation_units_unit_id_chromebook_cart_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."chromebook_cart_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_reservations" ADD CONSTRAINT "cart_reservations_teacher_id_campus_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."campus_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_reservations" ADD CONSTRAINT "cart_reservations_cart_id_chromebook_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."chromebook_carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chromebook_cart_units_asset_tag_unique" ON "chromebook_cart_units" USING btree ("asset_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "chromebook_carts_code_unique" ON "chromebook_carts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_reservation_unit_unique" ON "cart_reservation_units" USING btree ("reservation_id","unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_reservation_slot_unique" ON "cart_reservations" USING btree ("scheduled_date","cart_id","start_time","end_time");--> statement-breakpoint
CREATE UNIQUE INDEX "campus_users_email_unique" ON "campus_users" USING btree ("email");