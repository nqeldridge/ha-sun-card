# Sun Year Card

A Home Assistant dashboard card that shows sunrise and sunset across the whole year.

- **Today and tomorrow**: sunrise and sunset times, with how much tomorrow's times shift.
- **Next time change**: a live countdown to the next daylight saving clock change.
- **Year chart**: sunrise and sunset curves, three months back and nine ahead, with a marker for:
  - today
  - the earliest and latest sunset of the year
  - the next day with a later sunset than today
  - the next day with an earlier sunrise than today
  - each clock change (dashed line)
- Hover or tap the chart to see any day's times and daylight length.

No integrations, sensors or internet access are needed. The card calculates everything in the browser from your Home Assistant home location and time zone. It follows your theme (light or dark) and your profile's 12/24-hour setting.

## Install with HACS

1. In HACS, open the menu (⋮) and choose **Custom repositories**.
2. Add this repository's URL with the type **Dashboard**.
3. Find **Sun Year Card** in HACS and download it.
4. Reload your browser when prompted.

HACS adds the dashboard resource for you.

## Manual install

1. Copy `dist/sun-year-card.js` to `/config/www/sun-year-card.js`.
2. Go to **Settings → Dashboards → ⋮ → Resources** and add `/local/sun-year-card.js` as a **JavaScript module**.
3. Reload your browser.

## Add the card

Edit a dashboard, choose **Add card**, and search for **Sun Year Card**. Or in YAML:

```yaml
type: custom:sun-year-card
```

## Options

| Option           | Type    | Default                 | Description                                           |
| ---------------- | ------- | ----------------------- | ----------------------------------------------------- |
| `title`          | string  | `Sun Year`              | Card heading. Set to `""` to hide it.                 |
| `show_countdown` | boolean | `true`                  | Show the next time change countdown.                  |
| `show_legend`    | boolean | `true`                  | Show the list of key dates under the chart.           |
| `latitude`       | number  | Home Assistant location | Use a different location.                             |
| `longitude`      | number  | Home Assistant location | Use a different location.                             |
| `sunrise_color`  | string  | gold                    | Any CSS color for the sunrise line.                   |
| `sunset_color`   | string  | magenta                 | Any CSS color for the sunset line.                    |

Example:

```yaml
type: custom:sun-year-card
title: Daylight
show_legend: false
sunset_color: "#e4572e"
```

## Notes

- Times use the time zone set in your Home Assistant profile (server or browser time zone).
- The chart is drawn in clock time, so the curves jump by an hour at each clock change.
- Sunrise and sunset are calculated to within about a minute of published tables.

## License

MIT
