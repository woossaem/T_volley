import React, { useState } from 'react';
import MatchResultModal from './MatchResultModal';
import MatchRosterModal, { type RosterMember } from './MatchRosterModal';

type ResultProps = React.ComponentProps<typeof MatchResultModal>;

/**
 * 기존 빠른 결과 입력(MatchResultModal)을 유지하면서
 * 미가입 선수 교체(MatchRosterModal)를 같은 흐름에서 연다.
 */
export default function QuickResultModal(props: ResultProps) {
  const [rosterVisible, setRosterVisible] = useState(false);
  const match = props.match;

  return (
    <>
      <MatchResultModal
        {...props}
        onOpenRosterReplace={() => setRosterVisible(true)}
      />
      <MatchRosterModal
        visible={rosterVisible}
        matchId={match?.id}
        hostTeamName={match?.host_team_name}
        awayTeamName={match?.away_team_name}
        hostMembers={(props.hostMembers || []) as RosterMember[]}
        awayMembers={(props.awayMembers || []) as RosterMember[]}
        onClose={() => setRosterVisible(false)}
      />
    </>
  );
}
