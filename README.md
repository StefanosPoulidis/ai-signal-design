# AI Signal Design

Companion website for the paper **_Dynamic AI Signal Policy Design_** by Stefanos Poulidis (INSEAD, Decision Sciences).

Live site: https://stefanospoulidis.github.io/ai-signal-design

## What's here

A static site that translates the paper's findings into a practical framework for MBA students and managers deploying human-in-the-loop AI systems.

| Page | Purpose |
|------|---------|
| `index.html` | Hero, the central tension, three-regime rule, map of the site |
| `simulator.html` | Interactive 5×20 tabular MDP comparing myopic, RD, and SPD policies as you slide drift and budget |
| `diagnose.html` | Five-question screener that returns a design-object recommendation (myopic / RD / SPD / diagnostic-only) |
| `concepts.html` | Efficacy, the factored kernel, the IDE decomposition, and a comparison table of the three design objects |
| `cases.html` | Hospital alert fatigue, ambulatory CDS, chess tutoring, and C-MAPSS turbofan with the paper's actual benchmark numbers |
| `research.html` | Paper title, abstract, BibTeX citation, and a link to the PDF |

## Stack

- Static HTML, CSS, and vanilla JavaScript. No build step.
- [Chart.js](https://www.chartjs.org/) via CDN for the simulator time-series charts.
- [Google Fonts](https://fonts.google.com) for Crimson Pro (headings) and Inter (body).
- Deployed via GitHub Pages from the `main` branch.

## Local development

```bash
# from this directory
npx serve -l 8091
# or any static server
python3 -m http.server 8091
```

Then open <http://localhost:8091>.

## Paper

The PDF lives at `assets/dynamic-ai-signal-policy-design.pdf`. The working copy of the manuscript lives in a separate repository.

## Citation

```bibtex
@unpublished{Poulidis2026SignalDesign,
  author  = {Poulidis, Stefanos},
  title   = {Dynamic {AI} Signal Policy Design},
  note    = {Working paper, INSEAD},
  year    = {2026}
}
```

## License

Code released under the MIT license. The paper and its figures are © the author.
