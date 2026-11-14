/**
 * NHIS Station controls. React Aria Components supply behaviour (keyboard,
 * focus, semantics, pointer/touch). NHIS supplies appearance and operational
 * rules. Downstream code uses these wrappers, not raw React Aria (03 §4.1).
 */
import { useState, type ReactNode } from 'react';
import {
  Button as RACButton,
  Checkbox as RACCheckbox,
  Dialog,
  DialogTrigger,
  Disclosure as RACDisclosure,
  DisclosurePanel,
  FieldError,
  Heading,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  Popover,
  Radio,
  RadioGroup,
  Select as RACSelect,
  SelectValue,
  Tab as RACTab,
  TabList as RACTabList,
  TabPanel as RACTabPanel,
  Tabs as RACTabs,
  Text,
  TextArea,
  TextField as RACTextField,
  Tooltip as RACTooltip,
  TooltipTrigger,
  type ButtonProps as RACButtonProps,
  type Key,
  type TabsProps,
} from 'react-aria-components';
import { Glyph, type GlyphName } from '../shared/Glyph';
import './controls.css';

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */
export type ButtonIntent = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps extends Omit<RACButtonProps, 'className' | 'style' | 'children'> {
  intent?: ButtonIntent;
  size?: 'default' | 'compact';
  icon?: GlyphName;
  /** Icon-only buttons must still have an accessible name via aria-label. */
  iconOnly?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * Achromatic by design: action emphasis comes from luminance and weight,
 * never from red, yellow or blue, which are reserved for alerts (NHIS A1).
 * Use `isPending` for loading; the label stays, a progress mark is added and
 * the button stays focusable (React Aria pending semantics).
 */
export function Button({ intent = 'secondary', size = 'default', icon, iconOnly, children, className, ...rest }: ButtonProps) {
  return (
    <RACButton
      {...rest}
      className={cx('nhis-button', `nhis-button--${intent}`, `nhis-button--${size}`, iconOnly && 'nhis-button--icon-only', className)}
    >
      {({ isPending }) => (
        <>
          {isPending ? <span className="nhis-button__spinner" aria-hidden="true" /> : icon && <Glyph name={icon} size={20} />}
          {iconOnly ? null : <span className="nhis-button__label">{children}</span>}
          {isPending && <span className="nhis-visually-hidden">Working</span>}
        </>
      )}
    </RACButton>
  );
}

/* ------------------------------------------------------------------ */
/* HazardousAction — NHIS A10                                          */
/* Black-and-yellow striping + mandatory confirmation dialog.          */
/* ------------------------------------------------------------------ */
export interface HazardousActionProps {
  label: string;
  /** Dialog title, phrased as the action. */
  confirmTitle: string;
  /** What will happen, including whether it can be undone. */
  consequence: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  isDisabled?: boolean;
}

export function HazardousAction({ label, confirmTitle, consequence, confirmLabel, onConfirm, isDisabled }: HazardousActionProps) {
  return (
    <DialogTrigger>
      <RACButton className="nhis-button nhis-button--hazard nhis-button--default" isDisabled={isDisabled}>
        <span className="nhis-button__hazard-stripe" aria-hidden="true" />
        <span className="nhis-button__label">{label}</span>
      </RACButton>
      <ModalOverlay className="nhis-modal-overlay" isDismissable={false}>
        <Modal className="nhis-modal">
          <Dialog role="alertdialog" className="nhis-dialog nhis-dialog--hazard">
            {({ close }) => (
              <>
                <div className="nhis-dialog__hazard-band" aria-hidden="true" />
                <Heading slot="title" className="nhis-dialog__title">
                  {confirmTitle}
                </Heading>
                <div className="nhis-dialog__body">{consequence}</div>
                <div className="nhis-dialog__actions">
                  <Button intent="secondary" onPress={close} autoFocus>
                    Cancel
                  </Button>
                  <Button
                    intent="primary"
                    onPress={() => {
                      onConfirm();
                      close();
                    }}
                  >
                    {confirmLabel}
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

/* ------------------------------------------------------------------ */
/* TextField                                                           */
/* ------------------------------------------------------------------ */
export interface TextFieldProps {
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  multiline?: boolean;
  placeholder?: string;
  name?: string;
  className?: string;
}

export function TextField({ label, description, errorMessage, multiline, placeholder, className, ...rest }: TextFieldProps) {
  return (
    <RACTextField {...rest} className={cx('nhis-field', className)}>
      <Label className="nhis-field__label">{label}</Label>
      {multiline ? (
        <TextArea className="nhis-field__input nhis-field__input--multiline" placeholder={placeholder} rows={3} />
      ) : (
        <Input className="nhis-field__input" placeholder={placeholder} />
      )}
      {description && (
        <Text slot="description" className="nhis-field__description">
          {description}
        </Text>
      )}
      <FieldError className="nhis-field__error">
        <Glyph name="unknown" size={16} />
        {errorMessage}
      </FieldError>
    </RACTextField>
  );
}

/* ------------------------------------------------------------------ */
/* ChoiceGroup — radio semantics; `chips` presentation for quick        */
/* replies (NHIS A15) and categorical scales without drag (A30).       */
/* ------------------------------------------------------------------ */
export interface Choice {
  id: string;
  label: string;
  description?: string;
}

export interface ChoiceGroupProps {
  label: string;
  options: Choice[];
  value?: string | null;
  defaultValue?: string;
  onChange?: (v: string) => void;
  presentation?: 'list' | 'chips';
  description?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function ChoiceGroup({ label, options, presentation = 'list', description, orientation, className, ...rest }: ChoiceGroupProps) {
  return (
    <RadioGroup
      {...rest}
      orientation={orientation ?? (presentation === 'chips' ? 'horizontal' : 'vertical')}
      className={cx('nhis-choice-group', `nhis-choice-group--${presentation}`, className)}
    >
      <Label className="nhis-field__label">{label}</Label>
      {description && (
        <Text slot="description" className="nhis-field__description">
          {description}
        </Text>
      )}
      <div className="nhis-choice-group__options">
        {options.map((o) => (
          <Radio key={o.id} value={o.id} className="nhis-choice">
            {({ isSelected }) => (
              <>
                {presentation === 'list' && <span className={cx('nhis-choice__dot', isSelected && 'is-selected')} aria-hidden="true" />}
                {presentation === 'chips' && isSelected && <Glyph name="check" size={16} />}
                <span className="nhis-choice__text">
                  <span className="nhis-choice__label">{o.label}</span>
                  {o.description && <span className="nhis-choice__description">{o.description}</span>}
                </span>
              </>
            )}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}

/* ------------------------------------------------------------------ */
/* Checkbox                                                            */
/* ------------------------------------------------------------------ */
export function Checkbox({
  children,
  ...rest
}: {
  children: ReactNode;
  isSelected?: boolean;
  defaultSelected?: boolean;
  onChange?: (v: boolean) => void;
  isDisabled?: boolean;
}) {
  return (
    <RACCheckbox {...rest} className="nhis-checkbox">
      {({ isSelected }) => (
        <>
          <span className={cx('nhis-checkbox__box', isSelected && 'is-selected')} aria-hidden="true">
            {isSelected && <Glyph name="check" size={16} />}
          </span>
          <span>{children}</span>
        </>
      )}
    </RACCheckbox>
  );
}

/* ------------------------------------------------------------------ */
/* Select                                                              */
/* ------------------------------------------------------------------ */
export function Select({
  label,
  options,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  placeholder = 'Select',
  isDisabled,
}: {
  label: string;
  options: Choice[];
  selectedKey?: Key | null;
  defaultSelectedKey?: Key;
  onSelectionChange?: (k: Key | null) => void;
  placeholder?: string;
  isDisabled?: boolean;
}) {
  return (
    <RACSelect
      className="nhis-field"
      selectedKey={selectedKey}
      defaultSelectedKey={defaultSelectedKey}
      onSelectionChange={onSelectionChange}
      placeholder={placeholder}
      isDisabled={isDisabled}
    >
      <Label className="nhis-field__label">{label}</Label>
      <RACButton className="nhis-field__input nhis-select__trigger">
        <SelectValue className="nhis-select__value" />
        <Glyph name="chevron-down" size={20} />
      </RACButton>
      <Popover className="nhis-popover">
        <ListBox className="nhis-listbox">
          {options.map((o) => (
            <ListBoxItem key={o.id} id={o.id} className="nhis-listbox__item" textValue={o.label}>
              {({ isSelected }) => (
                <>
                  <span className="nhis-listbox__check">{isSelected && <Glyph name="check" size={16} />}</span>
                  {o.label}
                </>
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </RACSelect>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */
export function Tabs(props: Omit<TabsProps, 'className'>) {
  return <RACTabs {...props} className="nhis-tabs" />;
}
export function TabList({ children, 'aria-label': ariaLabel }: { children: ReactNode; 'aria-label': string }) {
  return (
    <RACTabList className="nhis-tablist" aria-label={ariaLabel}>
      {children}
    </RACTabList>
  );
}
export function Tab({ id, children }: { id: string; children: ReactNode }) {
  return (
    <RACTab id={id} className="nhis-tab">
      {children}
    </RACTab>
  );
}
export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <RACTabPanel id={id} className="nhis-tabpanel">
      {children}
    </RACTabPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Disclosure — progressive disclosure (HealthTech P6; NHIS A32)       */
/* ------------------------------------------------------------------ */
export function Disclosure({
  title,
  children,
  defaultExpanded,
  isExpanded,
  onExpandedChange,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onExpandedChange?: (v: boolean) => void;
}) {
  return (
    <RACDisclosure className="nhis-disclosure" defaultExpanded={defaultExpanded} isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
      <Heading className="nhis-disclosure__heading">
        <RACButton slot="trigger" className="nhis-disclosure__trigger">
          <Glyph name="chevron-right" size={20} className="nhis-disclosure__chevron" />
          {title}
        </RACButton>
      </Heading>
      <DisclosurePanel className="nhis-disclosure__panel">{children}</DisclosurePanel>
    </RACDisclosure>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip — supplementary only; never the sole carrier of meaning.    */
/* ------------------------------------------------------------------ */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipTrigger delay={600}>
      {children}
      <RACTooltip className="nhis-tooltip" offset={8}>
        {content}
      </RACTooltip>
    </TooltipTrigger>
  );
}

/* ------------------------------------------------------------------ */
/* Panel — grouping surface                                            */
/* ------------------------------------------------------------------ */
export function Panel({
  title,
  actions,
  children,
  className,
  as: As = 'section',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'aside';
}) {
  return (
    <As className={cx('nhis-panel', className)}>
      {(title || actions) && (
        <header className="nhis-panel__header">
          {title && <h2 className="nhis-panel__title">{title}</h2>}
          {actions && <div className="nhis-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </As>
  );
}

/* Small helper for stories and compositions that need local toggles. */
export function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  return [on, () => setOn((v) => !v), setOn] as const;
}
