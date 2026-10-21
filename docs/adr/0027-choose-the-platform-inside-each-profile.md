# Choose the platform inside each profile

A standards source may serve projects hosted on more than one platform. Before
this decision, a profile was the whole selection, so a source that needed
different declarations per platform could only multiply its profiles, such as
`react-github` and `react-gitlab`, and nothing recorded which platform a project
was hosted on. As settled in decision 9, with decisions 1, 3 and 15, of
[repo-canon#504](https://github.com/lutzseverino/repo-canon/issues/504#issuecomment-6244638871)
and specified in [#300](https://github.com/lutzseverino/repo-standards/issues/300),
two decisions follow.

**The platform is a choice inside each profile.** A profile declares the
hosting platforms it supports in `platforms`, and a declaration may name the one
`platform` it applies on. A profile that declares no platforms supports
`github` alone, so every earlier source is unchanged. The adopting project
selects its profile and its platform separately. Resolution leaves out the
declarations for other platforms before scope, so a platform filter never
reads as an optional declaration's no scope
([ADR 0023](0023-let-an-optional-discovery-declaration-have-no-scope.md)).
Declarations for different platforms may share a target, because they never
install together. There are no per-platform profiles and no profile
composition.

A platform is named by Postern's `PlatformName`. Postern 1.0.0 exports no
runtime list of the platforms it serves, so the product keeps one constant of
the platforms it supports, typed `PlatformName[]` and holding only `github`.
Validation rejects any other identifier with `UNSUPPORTED_PLATFORM`. A Postern
major that widens `PlatformName` adds no platform until the constant does.

A profile that supports one platform selects it without asking and without
detection, so a project without a remote, or with one elsewhere, adopts as
before. Otherwise `adopt` takes an explicit answer, then the recorded platform
while the profile still supports it, then the platform Postern's
`detectPlatform` reports for the `origin` remote; a terminal confirms a detected
platform. No `origin` remote, a remote no adapter serves, or one the profile
does not support requires an explicit choice.

The platform is part of the selection: the recorded lock and `selection.yaml`,
the inspection's selection and so its identity and the discovery request's,
the confirmation bound to that identity, the run record, update comparison, and
the operation and discovery script inputs. Changing it is a changed selection
component, and an inspection or confirmation of another platform does not
start a run. A recorded selection without the field is read as `github`, the
only platform any earlier selection could use, and the next committed run
records it.

**Release-source reads go through Postern.** As implemented for
[#299](https://github.com/lutzseverino/repo-standards/issues/299), the product
pins `@lutzseverino/postern` 1.x exactly and reads a standards source's
releases and exact tags through its `ReleaseSource`. The product keeps stable
selection, exact-ref and commit or tree verification, tag-movement detection,
verified snapshot provenance, its retry and its outcomes. Repository search,
source metadata and commit or tree verification stay on the product's GitHub
boundary, because Postern has no port for them, and authored readiness probes
and remote setup fixes keep their protocol and ownership.

## Consequences

GitHub is still the only supported platform and the only source host. Published
files stay GitHub-shaped: no source or product file gains a Forgejo or GitLab
variant or trigger, and a GitHub adopter's installed content is unchanged.
Adding a platform means an adapter in Postern and an entry in the supported
constant; tests supply a second identifier through that one constant.

Reports and records gain the field without a format change: the lock reads
without it, and reports, summaries, `status` and `check` show it. The answers
file gains a `platform` question only for a profile that supports several
platforms.

## Considered options

- **Per-platform profiles.** A source would duplicate each profile per
  platform, and an adopter changing platforms would change profiles.
- **Compose a platform profile with a stack profile.** This is general profile
  composition, which resolution has avoided since its two levels of defaults
  and one profile.
- **Infer the platform from the profile name or always from the remote.** A
  name is not a fact about the project, and detection alone cannot serve a
  project without a remote or one the adopter moves.
- **Keep the release reads on the product's GitHub client.** This would keep a
  second implementation of what Postern's release port already provides.
