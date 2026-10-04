import { useEffect, useState, type RefObject } from 'react';
import { showAsChoices, showAsLine, showAsWidth, type ShowAs, type ShowAsChoice } from './showAs';

export interface ShownAs {
  choice: ShowAs;
  setChoice: (choice: ShowAs) => void;
  choices: readonly ShowAsChoice[];
  /** The card's width; undefined at the note's own. */
  width: number | undefined;
  /** The footer's line while not at the note's width. */
  line: string | null;
}

/** "Show as" for the window `rootRef` lives in, which may be a popout (§2.3). Never saved: the editor opens at the note's width. */
export function useShowAs(rootRef: RefObject<HTMLElement | null>): ShownAs {
  const [choice, setChoice] = useState<ShowAs>('note');
  const [windowWidth, setWindowWidth] = useState(0);
  useEffect(() => {
    const win = rootRef.current?.win;
    if (!win) return undefined;
    const measure = (): void => setWindowWidth(win.innerWidth);
    measure();
    win.addEventListener('resize', measure);
    return () => win.removeEventListener('resize', measure);
  }, [rootRef]);
  return {
    choice,
    setChoice,
    choices: showAsChoices(windowWidth),
    width: showAsWidth(choice, windowWidth),
    line: showAsLine(choice, windowWidth),
  };
}
