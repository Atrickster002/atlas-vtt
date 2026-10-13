import React, { useId } from 'react';
import { QUEST_STATUSES, type Quest, type QuestPlace, type QuestStatus } from '../../../../campaigns/quests/questTypes';
import { Select, type SelectOption } from '../../../../packages/components/primitives/Select';
import { t } from '../../../../i18n';
import { QuestPlacePicker } from './QuestPlacePicker';

const STATUS_OPTIONS: SelectOption<QuestStatus>[] = QUEST_STATUSES.map((status) => ({ value: status, label: t(`quest.status.${status}`) }));

interface QuestRowProps {
  quest: Quest;
  mapUrl: string | null;
  disabled: boolean;
  onOpen: () => void;
  onStatus: (status: QuestStatus) => void;
  onPlace: (place: QuestPlace | null) => void;
}

/** What a quest brings, as the row's second line: its experience and rewards. */
function questGains(quest: Quest): string {
  const experience = quest.experience ? [t('quest.experience', { count: quest.experience })] : [];
  return [...experience, ...quest.rewards].join(' · ');
}

/** A quest on its campaign's page: its status, its name (which opens its note) with what it brings, and its place on the world map. */
export function QuestRow({ quest, mapUrl, disabled, onOpen, onStatus, onPlace }: QuestRowProps): React.JSX.Element {
  const statusLabelId = useId();
  const gains = questGains(quest);

  return (
    <li className={`campaign-quest campaign-quest--${quest.status}`}>
      <span id={statusLabelId} hidden>{t('quest.statusOf', { title: quest.title })}</span>
      <div className="campaign-quest__status">
        <Select value={quest.status} options={STATUS_OPTIONS} onChange={onStatus} labelledBy={statusLabelId} disabled={disabled} />
      </div>
      <button type="button" className="campaign-quest__open" onClick={onOpen}>
        <span className="campaign-quest__title">{quest.title}</span>
        {gains !== '' && <span className="campaign-quest__gains">{gains}</span>}
      </button>
      <QuestPlacePicker title={quest.title} place={quest.place} mapUrl={mapUrl} onPlace={onPlace} disabled={disabled} />
    </li>
  );
}
