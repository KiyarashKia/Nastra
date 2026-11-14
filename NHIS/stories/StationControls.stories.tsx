import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button, Checkbox, ChoiceGroup, Disclosure, HazardousAction, Panel, Select, Tab, TabList, TabPanel, Tabs, TextField, Tooltip } from '../components/station/controls';
import './stories.css';

const meta: Meta = { title: 'Station/Controls' };
export default meta;
type S = StoryObj;

export const Buttons: S = {
  render: () => (
    <div className="sb-page">
      <h1 className="sb-h1">Buttons</h1>
      <p className="sb-lede">
        Achromatic: emphasis comes from luminance and weight, because red, yellow and blue belong to alerts. Hover, pressed and focus-visible come from React Aria interaction states. Tab
        to see the focus ring.
      </p>
      {(['primary', 'secondary', 'quiet'] as const).map((intent) => (
        <div key={intent} className="sb-row">
          <span className="sb-label" style={{ width: 100 }}>
            {intent}
          </span>
          <Button intent={intent}>Review evidence</Button>
          <Button intent={intent} icon="list">
            Open protocol
          </Button>
          <Button intent={intent} size="compact">
            Compact
          </Button>
          <Button intent={intent} isDisabled>
            Disabled
          </Button>
          <Button intent={intent} isPending>
            Sending
          </Button>
          <Button intent={intent} icon="close" iconOnly aria-label="Dismiss" />
        </div>
      ))}
      <h2 className="sb-h2">Hazardous or irreversible (A10)</h2>
      <p className="sb-note">Black-and-yellow striping plus a confirmation dialog. Cancel has initial focus.</p>
      <div className="sb-row">
        <HazardousAction
          label="Delete check-in history"
          confirmTitle="Delete all check-in history?"
          consequence={<p>This permanently removes 42 entries from this device. It cannot be undone. Data already sent to the flight surgeon is not affected.</p>}
          confirmLabel="Delete permanently"
          onConfirm={() => undefined}
        />
      </div>
    </div>
  ),
};

export const Fields: S = {
  render: () => {
    const [sev, setSev] = useState<string | null>(null);
    return (
      <div className="sb-page">
        <h1 className="sb-h1">Fields and selection</h1>
        <div className="sb-cols">
          <div className="sb-stack">
            <TextField label="Note" description="Visible to you and attached to this entry." />
            <TextField label="Body mass" defaultValue="71.4 kg" isReadOnly description="Read-only: from the last calibrated measurement." />
            <TextField label="Duration" isInvalid errorMessage="Enter a duration in minutes, e.g. 20." defaultValue="twenty" />
            <TextField label="Disabled field" isDisabled defaultValue="Not available in simulation" />
          </div>
          <div className="sb-stack">
            <ChoiceGroup
              label="How long has it lasted?"
              presentation="chips"
              value={sev}
              onChange={setSev}
              options={[
                { id: 'lt1h', label: 'Under 1 h' },
                { id: '1to6h', label: '1–6 h' },
                { id: 'gt6h', label: 'Over 6 h' },
              ]}
            />
            <ChoiceGroup
              label="Data view"
              defaultValue="live"
              options={[
                { id: 'live', label: 'Live', description: 'Updates as samples arrive' },
                { id: 'paused', label: 'Paused', description: 'Frozen; marked as-of; acquisition continues' },
              ]}
            />
            <Checkbox defaultSelected>Attach telemetry window</Checkbox>
            <Checkbox isDisabled>Attach video (not available)</Checkbox>
            <Select
              label="Time system"
              defaultSelectedKey="utc"
              options={[
                { id: 'utc', label: 'UTC' },
                { id: 'met', label: 'MET' },
              ]}
            />
          </div>
        </div>
        <p className="sb-note">Invalid is not Warning: it uses a dashed border, icon and text, never alert red (03 §15).</p>
      </div>
    );
  },
};

export const NavigationAndDisclosure: S = {
  name: 'Tabs, disclosure, tooltip, panel',
  render: () => (
    <div className="sb-page">
      <Panel title="Heart rate" actions={<Button size="compact" intent="quiet" icon="external">Open</Button>}>
        <Tabs defaultSelectedKey="trend">
          <TabList aria-label="Heart rate views">
            <Tab id="trend">Trend</Tab>
            <Tab id="events">Events</Tab>
            <Tab id="sources">Sources</Tab>
          </TabList>
          <TabPanel id="trend">Trend view content.</TabPanel>
          <TabPanel id="events">Event list content.</TabPanel>
          <TabPanel id="sources">Chest strap (measured) · Wrist sensor (backup).</TabPanel>
        </Tabs>
        <Disclosure title="How the baseline is calculated">Median and interquartile range of resting samples over the last 14 days, excluding exercise windows.</Disclosure>
        <div className="sb-row" style={{ marginTop: 12 }}>
          <Tooltip content="Round-trip delay to ground, measured on the last message.">
            <Button size="compact" intent="secondary">
              RTT 6 s
            </Button>
          </Tooltip>
        </div>
      </Panel>
    </div>
  ),
};
