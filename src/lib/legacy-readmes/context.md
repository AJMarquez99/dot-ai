# context/

**Answers: the live working state / handoff.** Cross-session/LLM coordination & handoff state.
Regenerable — if it disappears, the next session rebuilds working state from the code and git history.

Distinct from `knowledge/` (durable truth, not disposable session state).

## Version control

This is the **only** folder whose contents are gitignored by default (see `.gitignore` here).
The folder + this README are tracked; the working-state files inside are not. Distill at the end of
work — promote keepers to `knowledge/` or `lessons/`; the rest is disposable.
