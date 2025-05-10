import { useState, ReactNode } from "react";
import { PaystackButton as ReactPaystackButton } from "react-paystack";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

// Define custom Paystack metadata interface
interface PaystackMetadata {
  paymentMethod: string;
  custom_fields: Array<{
    display_name: string;
    variable_name: string;
    value: string;
  }>;
  [key: string]: any;
}

interface PaystackButtonProps {
  amount: number;
  email: string;
  onSuccess: (reference: string) => void;
  onClose?: () => void;
  className?: string;
  paymentMethod: string;
  metadata?: Record<string, any>;
  reference?: string;
  disabled?: boolean;
  callback?: (response: { reference: string }) => void;
}

export function PaystackButton({
  amount,
  email,
  onSuccess,
  onClose,
  className = "",
  paymentMethod,
  metadata = {},
  reference,
  disabled = false,
}: PaystackButtonProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Paystack config
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

  // Convert amount to kobo (smallest currency unit)
  // 100 kobo = 1 NGN (Nigerian Naira)
  // Note: We display prices in GHS but process payments in NGN for Paystack compatibility
  const amountInKobo = Math.floor(amount * 100);

  // Create Paystack metadata with required fields
  const paystackMetadata: PaystackMetadata = {
    paymentMethod,
    custom_fields: [
      {
        display_name: "Payment Method",
        variable_name: "payment_method",
        value: paymentMethod,
      },
    ],
    ...metadata,
  };

  // Handle payment success
  const handleSuccess = (reference: { reference: string }) => {
    setIsLoading(false);
    toast({
      title: t("checkout.payment.success"),
      description: t("checkout.payment.successDetail"),
    });
    onSuccess(reference.reference);
  };

  // Handle payment close
  const handleClose = () => {
    setIsLoading(false);
    toast({
      title: t("checkout.payment.cancelled"),
      description: t("checkout.payment.cancelledDetail"),
      variant: "destructive",
    });
    if (onClose) onClose();
  };

  // Create button text as a string instead of React element
  const buttonText = isLoading
    ? t("checkout.processingPayment")
    : t("Pay Now");

  return (
    <div className={className}>
      <ReactPaystackButton
        text={buttonText}
        className="w-full"
        onSuccess={handleSuccess}
        onClose={handleClose}
        reference={reference || ""}
        email={email}
        amount={amountInKobo}
        publicKey={publicKey}
        currency="GHS"
        metadata={paystackMetadata}
        callback={(response: { reference: string }) => {
          handleSuccess(response);
        }}
        disabled={disabled || isLoading}
        customButton={(props: any) => (
          <Button
            {...props}
            onClick={() => {
              setIsLoading(true);
              props.onClick();
            }}
            className="w-full"
            disabled={disabled || isLoading}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("checkout.processingPayment")}
              </div>
            ) : (
              t("Pay Now")
            )}
          </Button>
        )}
      />
    </div>
  );
}
