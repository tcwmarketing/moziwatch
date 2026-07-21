"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type AdminPageTab = "management" | "forecast" | "imports";

export function AdminPageTabs({
  management,
  forecast,
  imports,
}: {
  management: ReactNode;
  forecast: ReactNode;
  imports: ReactNode;
}) {
  const [tab, setTab] = useState<AdminPageTab>("management");
  const panels: Record<AdminPageTab, ReactNode> = {
    management,
    forecast,
    imports,
  };

  return (
    <>
      <section className="content-card admin-management">
        <div className="admin-management-heading">
          <div>
            <p className="eyebrow">Administration</p>
            <h2>Choose one task</h2>
          </div>
          <div
            className="admin-tabs"
            role="tablist"
            aria-label="Main administration sections"
          >
            {(
              [
                ["management", "People and submissions"],
                ["forecast", "Forecast status"],
                ["imports", "CSV import"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="admin-tab-content" role="tabpanel">
        {panels[tab]}
      </div>
    </>
  );
}
