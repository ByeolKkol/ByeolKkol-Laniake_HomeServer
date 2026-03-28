import WeightTab from './WeightTab';
import ActivityTab from './ActivityTab';
import SleepTab from './SleepTab';

export type HealthTabKey = 'weight' | 'activity' | 'sleep';

interface Props { view: HealthTabKey }

const HealthTab = ({ view }: Props): JSX.Element => (
  <>
    {view === 'weight'   && <WeightTab />}
    {view === 'activity' && <ActivityTab />}
    {view === 'sleep'    && <SleepTab />}
  </>
);

export default HealthTab;
