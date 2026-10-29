import { useEffect, useState } from 'react';
import type { BoardServices } from './board-services';

export function useBoardSubscriptions(services: BoardServices): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1);
    const unsubscribe = [
      services.index.subscribe(refresh),
      services.types.subscribe(refresh),
      services.workspaces.subscribe(refresh),
      services.boards.subscribe(refresh),
    ];
    return () => unsubscribe.forEach((stop) => stop());
  }, [services]);
  return version;
}
