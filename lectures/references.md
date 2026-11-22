---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
---

(references-page)=
# Cross-References and Citations

```{index} single: Test Corpus; References
```

% Patterns from lecture-python.myst (cite, cite:t), lecture-python-intro
% (numref, download), continuous_time_mcs (prf:ref) and
% lecture-python-programming (the {any} role).

## Targets and the `ref` role

A target `(references-page)=` precedes this page's header, as one does on 293
lecture files. A page-level target sits before the notebook header, not on a
heading, so it is always referenced with explicit text, the common form
(300 of 391 uses): {ref}`the references page <references-page>`. The plain form
takes its text from a heading: {ref}`a-section-target`.

(a-section-target)=
## A section with its own target

Sections carry targets too: see {ref}`this section <a-section-target>`.

## The `doc` role

The `{doc}` role links to another page by file name, plain -- {doc}`typography`
-- or with explicit text -- {doc}`the mathematics page <math>`. It is used
1,654 times across the series and is the form mystmd advises against.

## Numbered references

`{numref}` names a numbered figure: {numref}`fig-shortest-path` is a static
figure and {numref}`fig-random-walk` a figure produced by a code cell, both on
the {doc}`figures` page. Equations are referenced with `{eq}`, as in
{eq}`eq:cagan_demand`, and theorems and their kin with `{prf:ref}`, as in
{prf:ref}`thm-neumann` and {prf:ref}`def-markov-kernel`. The unnumbered proposition on
the proofs page is referenced the same way: {prf:ref}`prop-underinvestment`.

## Citations

Citations use `{cite}` (1,535 uses) with `author_year` reference style:
{cite:p}`russell2004history`, {cite:p}`north1989`. The textual form `{cite:t}`
(648 uses, two series) reads as a sentence element -- {cite:t}`keynes1940pay`
argued for compulsory saving -- and the parenthetical form `{cite:p}` is rare:
{cite:p}`bryant1984price`. Several keys in one role: {cite:p}`levitt2019did,Burns_2023`.
Every cited work is listed on the {doc}`zreferences` page by the
`{bibliography}` directive.

## Downloads

The `{download}` role offers a file from the repository:
{download}`the loaded helper script <_static/lecture_specific/code/loaded_script.py>`.

## The `any` role

% lecture-python-programming/debugging.md and oop_intro.md @ b0b0b566: the
% role always carries an explicit title, as here.
Three uses in one series (and its translations) reach a label with this role.
We have met {any}`the section above <a-section-target>` previously.
mystmd reports `any` as an unknown role.

## Footnotes

A cross-reference page also carries footnotes[^ref-fn], since the two are
often confused in a rendering check.

[^ref-fn]: The footnote body, with a citation inside it: {cite:p}`kuznets1939incomes`.

## Index roles

Index roles also appear in running text: {index}`Bellman equation <single: Bellman equation>`.

% A case for the theme-parity harness (QuantEcon/project-theme-parity#36's
% review), not a lecture construct: links to other sites whose fragment is a
% corpus label or an equation anchor. Neither is a reference to a proof block
% or an equation on this site.

## Links that leave the site

A link to another site can end in a fragment that a page here also defines.
These point at the lectures, not at this site: the Perron-Frobenius theorem in
[the eigenvalue lecture](https://intro.quantecon.org/eigen_II.html#perron-frobenius),
whose label the proofs page reuses, and
[a numbered equation in the linear algebra lecture](https://python.quantecon.org/linear_algebra.html#equation-la-se).
