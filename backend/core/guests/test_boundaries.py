"""Architectural tests for the module boundaries inside guests.

These assert the rules in ``guests/domains/__init__.py``. They fail on a
static read of the source, so a violation is caught the moment it is written
rather than when the code is later extracted into a service.

Keeping the boundary honest now is what makes the eventual extraction a
packaging change rather than a rewrite.
"""

import ast
from pathlib import Path

from django.test import SimpleTestCase


APP_ROOT = Path(__file__).resolve().parent
DOMAINS = APP_ROOT / 'domains'


def _imported_names(path: Path) -> list[str]:
    """Every module a file imports, absolute and relative alike."""
    tree = ast.parse(path.read_text(encoding='utf-8'))
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            # level counts the leading dots: `from ..models import X` is level 2.
            names.append(('.' * node.level) + (node.module or ''))
    return names


class DomainBoundaryTests(SimpleTestCase):
    """A domain may own its models; it may not reach into another's."""

    def test_every_domain_declares_its_purpose(self):
        for path in sorted(DOMAINS.glob('*.py')):
            if path.name == '__init__.py':
                continue
            with self.subTest(domain=path.stem):
                tree = ast.parse(path.read_text(encoding='utf-8'))
                self.assertIsNotNone(
                    ast.get_docstring(tree),
                    f'{path.name} must document what it owns and what it may not touch.',
                )

    def test_domains_do_not_import_each_other_directly(self):
        """Cross-domain traffic goes through a services module, not internals."""
        for path in sorted(DOMAINS.glob('*.py')):
            if path.name == '__init__.py':
                continue
            others = {
                other.stem for other in DOMAINS.glob('*.py')
                if other.stem not in {'__init__', path.stem}
            }
            for imported in _imported_names(path):
                for other in others:
                    # `.seating` from inside domains/ is a sibling domain.
                    forbidden = f'.{other}'
                    with self.subTest(domain=path.stem, imports=imported):
                        self.assertNotEqual(
                            imported, forbidden,
                            f'{path.name} imports the {other} domain directly. '
                            f'Call it through guests.domains.{other} instead.',
                        )

    def test_domains_never_import_views_or_serializers(self):
        """A domain is called by the transport layer, never the other way."""
        banned = ('views', 'serializers', 'urls')
        for path in sorted(DOMAINS.glob('*.py')):
            if path.name == '__init__.py':
                continue
            for imported in _imported_names(path):
                tail = imported.lstrip('.')
                with self.subTest(domain=path.stem, imports=imported):
                    self.assertNotIn(
                        tail.split('.')[0], banned,
                        f'{path.name} imports {imported}; a domain must not '
                        f'depend on the transport layer that calls it.',
                    )


class AppDependencyTests(SimpleTestCase):
    """The dependency direction between Django apps stays one-way."""

    BACKEND = APP_ROOT.parent

    def _python_files(self, app: str):
        root = self.BACKEND / app
        for path in root.rglob('*.py'):
            if 'migrations' in path.parts or '__pycache__' in path.parts:
                continue
            yield path

    def test_accounts_does_not_depend_on_guests_or_rsvp(self):
        """Identity must not know about the domain apps.

        accounts previously imported guests.models, which made the two
        mutually dependent and blocked either from being extracted. The
        cross-app reads that genuinely need both now live in platform_ops.
        """
        for path in self._python_files('accounts'):
            for imported in _imported_names(path):
                head = imported.lstrip('.').split('.')[0]
                with self.subTest(file=path.name, imports=imported):
                    self.assertNotIn(
                        head, ('guests', 'rsvp'),
                        f'accounts/{path.name} imports {imported}. '
                        f'Move the cross-app code to platform_ops instead.',
                    )

    #: guests <-> rsvp is a real cycle, currently held together by
    #: function-local imports so Python does not fail at module load. Each
    #: entry is one file that reaches into rsvp. The list may shrink; adding
    #: to it needs a deliberate decision, because every entry is work that
    #: Phase 3 has to undo before messaging can be extracted.
    KNOWN_GUESTS_TO_RSVP = {
        'tasks.py',        # pass_delivery_allowed, bulk_sync, reminder ids
        'webhook.py',      # inbound WhatsApp routed into rsvp
        'guests.py',       # sync_guest_to_workflow on guest edit
        'reminders.py',    # confirmed_reminder_guest_ids
        'event.py',        # RsvpWorkflow read in the event serializer
        'send_budget.py',  # counts RsvpRecipient sends against Meta's cap —
                           # the Phase 3 blocker, replaced by an owned ledger
    }

    def test_guests_to_rsvp_cycle_does_not_grow(self):
        """guests and rsvp are mutually dependent — freeze it, don't widen it.

        rsvp imports guests fifteen times; guests reaches back into rsvp from
        five files, all through function-local imports that dodge the circular
        import at module load. That is a genuine cycle, and it is why messaging
        cannot be extracted before the RSVP workflow moves with it.

        This test does not demand the cycle be fixed today. It fails when a
        *new* file joins it, so the debt stays bounded and visible.
        """
        offenders = set()
        for path in self._python_files('guests'):
            if path.name.startswith('test'):
                continue
            for imported in _imported_names(path):
                if imported.lstrip('.').split('.')[0] == 'rsvp':
                    offenders.add(path.name)

        new_offenders = offenders - self.KNOWN_GUESTS_TO_RSVP
        self.assertEqual(
            new_offenders, set(),
            f'New guests -> rsvp dependencies: {sorted(new_offenders)}. '
            f'guests is meant to be upstream of rsvp. If this is genuinely '
            f'necessary, add it to KNOWN_GUESTS_TO_RSVP with a reason.',
        )

        # Equally, keep the list honest as the cycle is unpicked.
        stale = self.KNOWN_GUESTS_TO_RSVP - offenders
        self.assertEqual(
            stale, set(),
            f'These no longer import rsvp: {sorted(stale)}. '
            f'Remove them from KNOWN_GUESTS_TO_RSVP.',
        )

    def test_nothing_imports_platform_ops(self):
        """platform_ops reads across the apps; nothing may depend on it."""
        for app in ('accounts', 'guests', 'rsvp'):
            for path in self._python_files(app):
                for imported in _imported_names(path):
                    head = imported.lstrip('.').split('.')[0]
                    with self.subTest(file=f'{app}/{path.name}', imports=imported):
                        self.assertNotEqual(
                            head, 'platform_ops',
                            f'{app}/{path.name} imports {imported}. '
                            f'platform_ops is a leaf: it reads from the apps, '
                            f'never the reverse.',
                        )
