// App entry — wires screens into design canvas + tweaks panel.

const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "amber",
  "traceSpeed": 1,
  "showHint": true,
  "ornate": false,
  "circuitKey": "half-wave-rectifier"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    applyAccent(tweaks.accent);
  }, [tweaks.accent]);

  // when circuit changes, dim aether so the player has to "run" the new one
  useEffect(() => { setLit(false); }, [tweaks.circuitKey]);

  const setCircuitKey = (k) => setTweak('circuitKey', k);

  return (
    <>
      <DesignCanvas title="CIRCUIT FORGE — SIEGE DOJO" subtitle="Cosmetic crafting subgame · 5 screens · 6 circuit blueprints">
        <DCSection id="forge" title="Primary Flow">
          <DCArtboard id="forge-main" label="01 · Circuit Forge (interactive · cycle blueprints)" width={1280} height={820}>
            <ScreenForge
              lit={lit}
              setLit={setLit}
              traceSpeed={tweaks.traceSpeed}
              showHint={tweaks.showHint}
              ornate={tweaks.ornate}
              circuitKey={tweaks.circuitKey}
              setCircuitKey={setCircuitKey}
            />
          </DCArtboard>
          <DCArtboard id="celebration" label="02 · Completion + Real Circuit Reveal" width={1280} height={820}>
            <ScreenCelebration circuitKey={tweaks.circuitKey} />
          </DCArtboard>
        </DCSection>

        <DCSection id="details" title="Component & Profile">
          <DCArtboard id="component-card" label="03 · Component Detail Card (hover)" width={720} height={540}>
            <ScreenComponent />
          </DCArtboard>
          <DCArtboard id="profile" label="04 · Public Warlord's Card" width={720} height={540}>
            <ScreenProfile circuitKey={tweaks.circuitKey} />
          </DCArtboard>
        </DCSection>

        <DCSection id="gallery" title="Collection">
          <DCArtboard id="gallery-main" label="05 · Cosmetic Reliquary (all 8)" width={1280} height={820}>
            <ScreenGallery />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Blueprint">
          <TweakSelect
            label="Active circuit"
            value={tweaks.circuitKey}
            options={CIRCUIT_KEYS.map(k => ({ value: k, label: window.CIRCUITS[k].title + ' — ' + window.CIRCUITS[k].realName }))}
            onChange={v => setTweak('circuitKey', v)}
          />
          <TweakToggle
            label="Aether running (preview lit state)"
            value={lit}
            onChange={setLit}
          />
        </TweakSection>
        <TweakSection title="Accent">
          <TweakRadio
            label="Color tone"
            value={tweaks.accent}
            options={[
              { value: 'amber', label: 'Amber (default)' },
              { value: 'verdigris', label: 'Verdigris' },
              { value: 'blood', label: 'Bloodoak' },
              { value: 'arcane', label: 'Arcane Blue' },
            ]}
            onChange={v => setTweak('accent', v)}
          />
        </TweakSection>
        <TweakSection title="Forge Board">
          <TweakSlider
            label="Trace energy speed"
            value={tweaks.traceSpeed}
            min={0.3} max={2.5} step={0.1}
            onChange={v => setTweak('traceSpeed', v)}
          />
          <TweakToggle
            label="Show silhouette hint"
            value={tweaks.showHint}
            onChange={v => setTweak('showHint', v)}
          />
          <TweakToggle
            label="Ornate component skins"
            value={tweaks.ornate}
            onChange={v => setTweak('ornate', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
