package coordination

// Repository is the abstraction that callers depend on for all coordination
// state persistence. Both JSON-file and SQLite backends implement this
// interface so the business logic never touches a concrete storage type.
type Repository interface {
	// Load reads the full coordination state (agents, skills, tasks, sessions, events).
	Load() (State, error)

	// Save writes the full coordination state back to the underlying store.
	Save(state State) error
}

// WithState performs an atomic read-modify-write against a Repository.
// It loads the state, passes a pointer to fn, and saves the result when
// fn reports changed == true.
func WithState(repo Repository, fn func(*State) (bool, error)) error {
	state, err := repo.Load()
	if err != nil {
		return err
	}
	changed, err := fn(&state)
	if err != nil {
		if changed {
			if saveErr := repo.Save(state); saveErr != nil {
				return saveErr
			}
		}
		return err
	}
	if changed {
		return repo.Save(state)
	}
	return nil
}
