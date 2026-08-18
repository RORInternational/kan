CREATE TABLE IF NOT EXISTS "oauthAccessToken" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"accessToken" text NOT NULL,
	"refreshToken" text NOT NULL,
	"accessTokenExpiresAt" timestamp NOT NULL,
	"refreshTokenExpiresAt" timestamp NOT NULL,
	"clientId" text NOT NULL,
	"userId" uuid,
	"scopes" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	CONSTRAINT "oauthAccessToken_accessToken_unique" UNIQUE("accessToken"),
	CONSTRAINT "oauthAccessToken_refreshToken_unique" UNIQUE("refreshToken")
);
--> statement-breakpoint
ALTER TABLE "oauthAccessToken" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauthApplication" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"metadata" text,
	"clientId" text NOT NULL,
	"clientSecret" text,
	"redirectUrls" text NOT NULL,
	"type" text NOT NULL,
	"disabled" boolean DEFAULT false,
	"userId" uuid,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	CONSTRAINT "oauthApplication_clientId_unique" UNIQUE("clientId")
);
--> statement-breakpoint
ALTER TABLE "oauthApplication" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauthConsent" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"userId" uuid NOT NULL,
	"scopes" text NOT NULL,
	"consentGiven" boolean NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauthConsent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauthAccessToken" ADD CONSTRAINT "oauthAccessToken_clientId_oauthApplication_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauthApplication"("clientId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauthAccessToken" ADD CONSTRAINT "oauthAccessToken_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauthApplication" ADD CONSTRAINT "oauthApplication_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauthConsent" ADD CONSTRAINT "oauthConsent_clientId_oauthApplication_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauthApplication"("clientId") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauthConsent" ADD CONSTRAINT "oauthConsent_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
