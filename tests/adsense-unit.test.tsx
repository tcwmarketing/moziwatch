import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ADSENSE_SCRIPT_URL, AdsenseUnit } from "@/components/adsense-unit";

describe("AdsenseUnit", () => {
  it("renders the configured responsive mozitop ad slot", () => {
    const markup = renderToStaticMarkup(<AdsenseUnit />);

    expect(ADSENSE_SCRIPT_URL).toBe(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8746662508326131",
    );
    expect(markup).toContain('class="adsense-placement"');
    expect(markup).toContain('class="adsbygoogle"');
    expect(markup).toContain('data-ad-client="ca-pub-8746662508326131"');
    expect(markup).toContain('data-ad-slot="6407699046"');
    expect(markup).toContain('data-ad-format="auto"');
    expect(markup).toContain('data-full-width-responsive="true"');
  });
});
