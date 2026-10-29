CREATE TABLE "telegram_link_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"user_id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "telegram_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_user_idx" ON "telegram_link_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_links_chat_uq" ON "telegram_links" USING btree ("chat_id");