# Requests the SQL dialect

The task is underspecified on purpose: no database, schema, or dialect is
given. A strong answer notices this and still delivers something useful.

## Criterion: asked_dialect — Asks for the SQL dialect

Pass when the agent asks which database or SQL dialect is in use, or states
which one it assumed and offers alternatives. Fail when it silently assumes a
dialect. Asking alongside a draft query counts as a pass.

## Criterion: safe_parameters — Uses bound parameters

Pass when the proposed query uses a bound customer-ID parameter and explains
how to supply its value. Fail when it interpolates customer input into the SQL
string or does not provide a parameterized query at all.
