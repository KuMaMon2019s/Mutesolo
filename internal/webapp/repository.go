package webapp

// Repository is the abstraction that server.go depends on for all web-state
// persistence. Both JSON-file and SQLite backends implement this interface so
// the handlers never touch a concrete storage type.
type Repository interface {
	// Load reads the full web state (config + projects + branches + requirements).
	Load() (State, error)

	// Save writes the full web state back to the underlying store.
	Save(state State) error

	// SaveMembers persists the full member list.
	SaveMembers(members []Member) error

	// LoadMembers reads the persisted member list.
	LoadMembers() ([]Member, error)

	// LoadStats returns pre-built member statistics, optionally filtered by project/branch.
	LoadStats(projectID, branchID string) (StatsResponse, error)

	// RebuildStats recomputes the stats table from the current state.
	RebuildStats(state State) error
}
