import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useState } from "react";

import Button from "~/components/Button";
import { PageHead } from "~/components/PageHead";
import { authClient } from "@kan/auth/client";

/**
 * The one screen that makes OAuth different from an API key: the person is on
 * Kan's own domain, signed in as themselves, deciding whether an outside app
 * may act for them. Nothing is issued until Allow is pressed here.
 */
export default function OAuthConsentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId =
    typeof router.query.client_id === "string" ? router.query.client_id : null;
  const scope =
    typeof router.query.scope === "string" ? router.query.scope : "";
  const scopes = scope.split(/[\s,]+/).filter(Boolean);

  const decide = async (accept: boolean) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const { data, error: consentError } = await authClient.oauth2.consent({
        accept,
      });
      if (consentError) {
        setError(consentError.message ?? t`Something went wrong.`);
        setIsSubmitting(false);
        return;
      }
      if (data?.redirectURI) {
        window.location.href = data.redirectURI;
        return;
      }
      setError(t`No redirect was returned. Close this tab and try again.`);
      setIsSubmitting(false);
    } catch {
      setError(t`Something went wrong.`);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageHead title={t`Authorise access`} />
      <div className="flex h-screen flex-col items-center justify-center bg-light-100 px-4 dark:bg-dark-50">
        <div className="w-full max-w-md rounded-xl border border-light-300 bg-light-50 p-8 dark:border-dark-200 dark:bg-dark-100">
          <h1 className="mb-2 text-xl font-bold text-light-1000 dark:text-dark-1000">
            {t`Authorise access`}
          </h1>
          <p className="mb-6 text-sm text-light-900 dark:text-dark-900">
            {clientId
              ? t`An application is asking to use your Kan account. It will be able to do anything you can do.`
              : t`Missing request details. Start again from the application you were connecting.`}
          </p>

          {scopes.length > 0 && (
            <ul className="mb-6 space-y-1 rounded-md border border-light-300 bg-light-100 p-3 text-sm text-light-950 dark:border-dark-300 dark:bg-dark-50 dark:text-dark-950">
              {scopes.map((s) => (
                <li key={s} className="font-mono text-xs">
                  {s}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="mb-4 text-sm font-medium text-red-600">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => void decide(true)}
              disabled={isSubmitting || !clientId}
              isLoading={isSubmitting}
            >
              {t`Allow`}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void decide(false)}
              disabled={isSubmitting || !clientId}
            >
              {t`Deny`}
            </Button>
          </div>

          <p className="mt-6 text-xs text-light-800 dark:text-dark-800">
            {t`You can revoke this at any time without affecting your API keys.`}
          </p>
        </div>
      </div>
    </>
  );
}
