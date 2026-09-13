# Use agent discovery with confirmed concrete scope

Status: accepted design in [issue #41](https://github.com/lutzseverino/repo-standards/issues/41).
Availability follows the implementation tickets and [architecture](../architecture.md).

Authors need contextual standards that apply across unfamiliar project layouts,
but maintained-project membership is a semantic judgment. Authors therefore
provide discovery guidance, agents propose evidence-backed concrete scope, and
adopters confirm it together with the complete adoption inspection; the CLI
verifies structure, path safety, ownership conflicts, and freshness. Discovery
materializes individual file paths using the existing disjoint target model.
This deliberately avoids a product-specific classifier and author-executed discovery hooks at the
cost of requiring reviewed agent judgment before adoption.

Decision confirmed in the contextual-scope interview and final simplicity review.
Planning destination filenames before confirmation avoids adding a protected
directory language while retaining location-independent coverage.
