"""Recheck retained source and public-CLI evidence, without replaying conversation."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent


def read_json(path):
    return json.loads(path.read_text())


def validation_result(path):
    record = read_json(path)
    assert record['exitStatus'] == 0, path
    assert record['stderr'] == '', path
    return json.loads(record['stdout'])


def verify_journey(journey,allowed_changes,expected_additions):
    directory = ROOT / journey
    before = read_json(directory / 'before/snapshot.json')
    after = read_json(directory / 'after/snapshot.json')
    changed = sorted(name for name, entry in before['files'].items()
                     if after['files'].get(name) != entry)
    added = sorted(after['files'].keys() - before['files'].keys())
    assert set(changed) == allowed_changes, (journey, changed)
    assert set(added) == expected_additions, (journey, added)
    assert not before['files'].keys() - after['files'].keys()
    for key in ['head', 'indexEntries', 'indexSha256', 'stagedDiff']:
        assert before[key] == after[key], (journey, key)
    for name, entry in before['files'].items():
        assert after['files'][name]['mode'] == entry['mode'], (journey, name)
    for stage in ['before', 'after']:
        snapshot = read_json(directory / stage / 'snapshot.json')
        for name, entry in snapshot['files'].items():
            path = directory / stage / 'source' / name
            assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256'], path
            # Git archives preserve executable state, not the creator's umask bits.
            assert path.stat().st_mode & 0o111 == int(entry['mode'], 8) & 0o111, path

    initial = validation_result(directory / 'validation-before-independent.json')
    final = validation_result(directory / 'validation-after-independent.json')
    assert initial['valid'] and final['valid']
    assert set(initial['profiles']) == set(final['profiles']) == {'personal', 'library', 'employer'}
    for profile in ['library', 'employer']:
        assert initial['profiles'][profile] == final['profiles'][profile], (journey, profile)
    assert not any(part in {'.repo-standards', '.agents'}
                   for name in after['files'] for part in Path(name).parts)

    transcript = (directory / 'transcript.md').read_text()
    for name in ['standards.yaml', 'authoring-notes.md', 'files/editorconfig',
                 'files/contributing.md', 'files/personal-contributing.md',
                 'guidance/readme.md', 'guidance/personal-readme.md',
                 'guidance/employer-readme.md', 'guidance/releases.md']:
        pattern = (r'(?:### ' + re.escape(name) + r'|`' + re.escape(name)
                   + r'`)\n\n```[^\n]*\n(.*?)```')
        reviewed_contents = re.findall(pattern, transcript, re.S)
        assert (directory / 'after/source' / name).read_text() in reviewed_contents, (journey, name)

    return {
        'wholeSourceContentMatchesAcceptedReview': True,
        'changedExistingFiles': changed,
        'addedFiles': added,
        'removedFiles': [],
        'headAndIndexBytesAndStagedDiffPreserved': True,
        'existingModesPreserved': True,
        'unrelatedFileBytesPreserved': True,
        'archivedContentHashesAndExecutableStateMatch': True,
        'libraryAndEmployerResolvedSelectionsPreserved': True,
        'allThreeProfilesValidate': True,
        'adoptionStateCreated': False,
    }


results = {
    'revision': verify_journey('revision', {'standards.yaml', 'authoring-notes.md'},
                              {'guidance/personal-readme.md', 'files/personal-contributing.md'}),
    'resumption': verify_journey('resumption', {'guidance/personal-readme.md', 'authoring-notes.md'}, set()),
}
revision = read_json(ROOT / 'revision/after/snapshot.json')
resumption = read_json(ROOT / 'resumption/before/snapshot.json')
assert revision['files'].keys() == resumption['files'].keys()
assert [name for name, entry in revision['files'].items()
        if resumption['files'][name] != entry] == ['guidance/personal-readme.md']
before_manual = (ROOT / 'revision/after/source/guidance/personal-readme.md').read_text()
after_manual = (ROOT / 'resumption/before/source/guidance/personal-readme.md').read_text()
assert before_manual.replace('Review the README every week to keep instructions current.\n', '') == after_manual
final_guidance = (ROOT / 'resumption/after/source/guidance/personal-readme.md').read_text()
assert 'Review the README every week' not in final_guidance
assert 'Review the README every week' in (ROOT / 'resumption/after/source/guidance/readme.md').read_text()
assert ((ROOT / 'revision/after/source/authoring-notes.md').read_bytes()
        == (ROOT / 'resumption/before/source/authoring-notes.md').read_bytes())
results['manualEdit'] = {
    'personalWeeklyRuleRemovedOnly': True,
    'notesInitiallyUnchanged': True,
    'personalWeeklyRuleNotRestored': True,
    'libraryWeeklyRulePreserved': True,
}
print(json.dumps(results, indent=2))
