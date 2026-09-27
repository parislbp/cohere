# {{FOLDER}}

**{{TITLE}}**{{SUBTITLE_MD}}

{{DESCRIPTION_MD}}

| | |
|---|---|
| template | `{{TEMPLATE}}` — {{TEMPLATE_DESC}} |
| author | {{AUTHOR}} |
| created | {{CREATED}} |
| version | {{VERSION}} |
| managed by | texref (`tex-*` commands) · manifest `tex.json` |

## Layout

```
{{FOLDER}}/
├── main.tex            preamble, title page, \input list (texref keeps the marked blocks in sync)
├── main.pdf            current build
├── Makefile            build targets (below)
├── tex.json            project manifest — do not delete; tex-* commands verify it
├── {{UNIT_DIR}}/{{LAYOUT_TREE}}
├── references/ref.bib  bibliography (biblatex + biber)
├── figures/            images (\graphicspath is set here)
├── aux/                build artifacts — safe to wipe
└── versions/           archived PDFs (make archive / tex-archive)
```

## Build

| command | does |
|---|---|
| `make` | compile `main.tex` → `main.pdf` |
| `make launch` | compile, open in Skim, then watch — save any `.tex`/`.bib` and it recompiles; Skim reloads |
| `make watch` | watch without opening a viewer |
| `make name NAME=foo` | compile to `foo.pdf` (`make foo.pdf` also works; `make name` alone prompts) |
| `make archive TAG=v0.2.0` | copy `main.pdf` → `versions/{{NAME}}_<date>_v0.2.0.pdf` |
| `make clean` / `make wipe` | remove `aux/*` / also remove `main.pdf` |
| `make count` | word count |
| `make help` | list targets |

## Manage (from anywhere inside the project)

| command | does |
|---|---|
| `tex-status` | verify structure and show the manifest |
| `tex-add` | add a {{UNIT}} (asks title, number of {{SUBUNIT}}s) |
| `tex-add appendix` | add an appendix |
| `tex-rm` | remove a {{UNIT}} (interactive; file is moved to `aux/removed/`) |
| `tex-ref` | add a bibliography entry interactively |
| `tex-ref list` | list bibliography keys |
| `tex-archive` | archive `main.pdf` into `versions/` with a version tag and note |

## Conventions

- Title metadata lives at the top of `main.tex` (`\doctitle`, `\docsubtitle`, `\docauthor`, `\docdate`, `\docversion`, `\docfootline`).
- Labels: `{{UNIT_LABEL}}:01`, `{{UNIT_LABEL}}:01:s1` for its {{SUBUNIT}}s, `app:a` for appendices, `tab:`, `fig:`, `eq:` for floats and equations.
- Tables: `\toprule`/`\midrule`/`\bottomrule` with `\rs` hairlines between body rows, `\thead{}` headers, `Y` stretch columns. See {{UNIT_DIR}}/{{FIRST_UNIT_FILE}} for a worked example.
- Bibliography: `\cite{key}`; add entries with `tex-ref` or edit `references/ref.bib`.
