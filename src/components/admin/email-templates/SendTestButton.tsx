"use client";

import { useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTemplateTestAction } from "@/app/admin/(protected)/email-templates/actions";

/** Sends the template being previewed to the signed-in admin's own address. */
export function SendTestButton(props: { id: string; locale: string; variant?: string; order?: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending || props.disabled}
      onClick={() =>
        start(async () => {
          const result = await sendTemplateTestAction(props);
          if (result.ok) toast.success(`Στάλθηκε στο ${result.to}. Ελέγξτε και τα ανεπιθύμητα.`);
          else toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      Αποστολή δοκιμαστικού σε εμένα
    </Button>
  );
}
