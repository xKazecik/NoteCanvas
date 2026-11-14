import { useEffect, useState } from 'react';
import throttle from 'lodash/throttle';

type UseEditorChromeOptions = {
  drawingName: string;
  autoHideEnabled: boolean;
  isRenaming: boolean;
};

export const useEditorChrome = ({
  drawingName,
  autoHideEnabled,
  isRenaming,
}: UseEditorChromeOptions) => {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  // The editor is a full-screen app with its own zoom. Zooming the page on a
  // tablet (a pinch on the header, or iOS zooming in on a focused text box)
  // pushes the header and toolbar off the top, so it is locked while editing.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = `${previous}, maximum-scale=1, user-scalable=no`;
    return () => {
      meta.content = previous;
    };
  }, []);

  useEffect(() => {
    document.title = `${drawingName} - notecanvas`;
    return () => {
      document.title = 'notecanvas';
    };
  }, [drawingName]);

  useEffect(() => {
    if (!autoHideEnabled || isRenaming) {
      setIsHeaderVisible(true);
      return;
    }

    let hideTimeout: ReturnType<typeof setTimeout> | null = null;
    let isInTriggerZone = false;

    const handleMouseMove = throttle((e: MouseEvent) => {
      const wasInTriggerZone = isInTriggerZone;
      isInTriggerZone = e.clientY < 5;

      if (isInTriggerZone) {
        setIsHeaderVisible(true);
        if (hideTimeout !== null) {
          clearTimeout(hideTimeout);
          hideTimeout = null;
        }
      } else if (wasInTriggerZone) {
        if (hideTimeout !== null) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
          setIsHeaderVisible(false);
        }, 2000);
      }
    }, 100);

    setIsHeaderVisible(true);
    hideTimeout = setTimeout(() => {
      setIsHeaderVisible(false);
    }, 3000);

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeout !== null) clearTimeout(hideTimeout);
    };
  }, [autoHideEnabled, isRenaming]);

  return {
    isHeaderVisible,
    setIsHeaderVisible,
  };
};
