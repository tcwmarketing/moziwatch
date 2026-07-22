"use client";

import { useEffect, useState } from "react";

export type SelectedHomeCity = {
  id: string;
  city: string;
  region: string;
  country: string;
  label: string;
  latitude: number;
  longitude: number;
};

export function HomeCityAutocomplete({
  initial,
  onSelect,
}: {
  initial: SelectedHomeCity | null;
  onSelect: (city: SelectedHomeCity | null) => void;
}) {
  const [value, setValue] = useState(initial?.label || "");
  const [suggestions, setSuggestions] = useState<SelectedHomeCity[]>([]);
  const [selected, setSelected] = useState<SelectedHomeCity | null>(initial);

  useEffect(() => {
    const query = value.trim();
    if (selected?.label === value || query.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const response = await fetch(
        `/api/cities/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      ).catch(() => null);
      if (!response?.ok) return;
      const result = (await response.json()) as {
        suggestions: SelectedHomeCity[];
      };
      setSuggestions(result.suggestions);
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selected, value]);

  function choose(city: SelectedHomeCity) {
    setSelected(city);
    setValue(city.label);
    setSuggestions([]);
    onSelect(city);
  }

  return (
    <div className="home-city-autocomplete">
      <input
        id="profile-home-city"
        name="homeCity"
        value={value}
        autoComplete="off"
        data-lpignore="true"
        data-form-type="other"
        maxLength={120}
        placeholder="Start typing a city"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls="home-city-suggestions"
        onChange={(event) => {
          setValue(event.target.value);
          setSelected(null);
          onSelect(null);
          if (event.target.value.trim().length < 2) setSuggestions([]);
        }}
        onBlur={() => window.setTimeout(() => setSuggestions([]), 160)}
      />
      {suggestions.length ? (
        <ul id="home-city-suggestions" role="listbox">
          {suggestions.map((city) => (
            <li key={city.id} role="option" aria-selected="false">
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(city)}
              >
                <strong>{city.city}</strong>
                <span>
                  {[city.region, city.country].filter(Boolean).join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <small>
        Select a city from the suggestions. Leave it empty to remove it.
      </small>
    </div>
  );
}
