import { useEffect, useState } from 'react';
import { api } from '../site/api.js';

// Loads enriched detection records (weight, drift track, risk) for a horizon.
export function useRecords(hours = 48) {
  const [state, setState] = useState({ records: [], hazards: [], loading: true, error: null });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all([api.records(hours), api.hazards()])
      .then(([records, hz]) => alive && setState({ records, hazards: hz.hazards, loading: false, error: null }))
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e.message })));
    return () => {
      alive = false;
    };
  }, [hours]);

  return state;
}
