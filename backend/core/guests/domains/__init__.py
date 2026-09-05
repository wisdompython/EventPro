"""Domain modules inside the guests app.

The app grew into a catch-all: twelve models covering events, guests, seating,
messaging and uploads. Splitting it into separate Django apps would mean
rewriting thirty-two migrations and renaming tables, which is risk without
payoff while everything still deploys as one unit.

Instead the code is divided here into the domains that would become services,
and each publishes a ``services.py`` — the only surface another domain may
call. Models stay where Django expects them (``guests.models``) so no migration
moves, but the *call graph* is already split along the future service seams.

Rules, enforced by ``guests.test_boundaries``:

  * A domain may import its own models freely.
  * A domain may call another domain only through that domain's ``services``.
  * No domain may reach into another's models, tasks or serializers.

When a domain is later extracted into its own container, its ``services``
module becomes the HTTP client and nothing else has to change.
"""
