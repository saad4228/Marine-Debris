import { useEffect, useState, useCallback } from 'react';
import { api } from '../site/api.js';

// Global trigger to notify all useRecords hooks across the app
export function notifyRecordsUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nadir:records-updated'));
  }
}

// Loads enriched detection records (weight, drift track, risk) for a horizon.
export function useRecords(hours = 48) {
  const [state, setState] = useState({ records: [], hazards: [], loading: true, error: null });
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const handleUpdate = () => refresh();
    if (typeof window !== 'undefined') {
      window.addEventListener('nadir:records-updated', handleUpdate);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('nadir:records-updated', handleUpdate);
      }
    };
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all([api.records(hours), api.hazards()])
      .then(([records, hz]) => alive && setState({ records, hazards: hz.hazards || [], loading: false, error: null }))
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e.message })));
    return () => {
      alive = false;
    };
  }, [hours, version]);

  return { ...state, refresh };
}
