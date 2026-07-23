import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthForm } from "@/components/auth-form";

describe("AuthForm social sign-in", () => {
  it("shows Google and hides Facebook by default", () => {
    const markup = renderToStaticMarkup(<AuthForm mode="sign-in" />);

    expect(markup).toContain("Continue with Google");
    expect(markup).not.toContain("Continue with Facebook");
  });
});
