# {{FOLDER}} — texref project Makefile ({{TEMPLATE}} template)
#
#   make                        compile main.tex → main.pdf
#   make launch                 compile, open in Skim, then watch: save any .tex/.bib and it recompiles
#   make name NAME=report_v1    compile to report_v1.pdf   (make name alone prompts; or: make report_v1.pdf)
#   make archive [TAG=v0.2.0]   copy main.pdf → versions/{{NAME}}_<date>[_TAG].pdf
#   make help                   list all targets
#
# All auxiliary files (.aux .log .toc .bbl .bcf .fls .fdb_latexmk …) live in aux/; only PDFs sit at top level.

PROJECT  := {{NAME}}
TEX      := main.tex
JOB      := main
PDF      := $(JOB).pdf
AUX      := aux
VERSIONS := versions
VIEWER   := Skim
ENGINE   := -pdf
LATEXMK  := latexmk $(ENGINE) -synctex=1 -interaction=nonstopmode -file-line-error -auxdir=$(AUX) -outdir=.
DATE     := $(shell date +%Y-%m-%d)
NAME     ?=
TAG      ?=

.DEFAULT_GOAL := main
.PHONY: main launch watch open name archive clean wipe count help

main: | $(AUX)               ## compile main.tex → main.pdf
	$(LATEXMK) $(TEX)

launch: main                 ## compile, open in Skim, watch and recompile on save (^C to stop)
	@open -a "$(VIEWER)" "$(PDF)"
	@echo "  watching $(TEX) — save to recompile · ^C to stop"
	$(LATEXMK) -pvc -view=none $(TEX)

watch: | $(AUX)              ## watch and recompile on save, no viewer
	$(LATEXMK) -pvc -view=none $(TEX)

open:                        ## open main.pdf in Skim
	@open -a "$(VIEWER)" "$(PDF)"

name: | $(AUX)               ## compile to <NAME>.pdf        make name NAME=report_v1
	@n="$(NAME)"; if [ -z "$$n" ]; then printf "  pdf name (without .pdf) › "; read n; fi; \
	test -n "$$n" || { echo "  aborted"; exit 1; }; \
	$(LATEXMK) -jobname="$${n%.pdf}" $(TEX)

%.pdf: $(TEX) | $(AUX)       ## make <anything>.pdf compiles main.tex under that job name
	$(LATEXMK) -jobname=$* $(TEX)

archive: main | $(VERSIONS)  ## copy main.pdf → versions/<project>_<date>[_TAG].pdf
	@out="$(VERSIONS)/$(PROJECT)_$(DATE)$(if $(TAG),_$(TAG),).pdf"; \
	cp "$(PDF)" "$$out" && echo "  archived → $$out"

clean:                       ## remove build artifacts in aux/ (keeps PDFs)
	-@$(LATEXMK) -c $(TEX) >/dev/null 2>&1
	@rm -rf $(AUX)/* && echo "  cleaned $(AUX)/"

wipe: clean                  ## clean + remove main.pdf and synctex
	@rm -f $(PDF) $(JOB).synctex.gz && echo "  removed $(PDF)"

count:                       ## word count via texcount
	@texcount -inc -total -brief $(TEX)

$(AUX) $(VERSIONS):
	@mkdir -p $@

help:                        ## show this help
	@echo ""
	@echo "  {{FOLDER}} — make targets"
	@echo "  ─────────────────────────────────────────────────────────────"
	@grep -E '^[a-zA-Z_%.]+:.*?## ' $(MAKEFILE_LIST) | sed -E 's/^([a-zA-Z_%.]+):[^#]*## (.*)/\1|\2/' | awk -F'|' '{printf "  %-10s %s\n", $$1, $$2}'
	@echo ""
