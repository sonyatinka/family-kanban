CREATE TABLE "family_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"role" "family_role" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "family_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_invites_family_id_idx" ON "family_invites" USING btree ("family_id");