import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact MoziWatch",
  description:
    "Contact MoziWatch about campground listings, mosquito reports, partnerships or general questions.",
  alternates: { canonical: absoluteUrl("/contact") },
};

export default function ContactPage() {
  return (
    <div className="content-page narrow prose-page contact-page">
      <p className="eyebrow">Contact us</p>
      <h1>How can we help?</h1>
      <p>
        For campground listing questions, partnerships, product inquiries or
        general feedback, use the form below and include as much relevant detail
        as you can.
      </p>
      <ContactForm />
      <p>
        To correct a specific campground listing, use the “Suggest an edit”
        button on that campground&apos;s page so the location is included
        automatically.
      </p>
    </div>
  );
}
