"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import type {
  AirportListResponse,
  EventManagementContext,
  EventSchedule,
  FirListResponse,
  ManagedEvent,
} from "@event-hub/contracts";

import { FeedbackState } from "@/components/feedback-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { EventWizard } from "./event-wizard";
import {
  emptyEventWizardValues,
  eventToWizardValues,
  eventWizardSteps,
  firstInvalidEventWizardStep,
  parseEventWizardDraft,
  serializeEventWizardDraft,
  toWireDateTime,
  validateEventWizard,
  validateEventWizardStep,
  wizardStorageKey,
  type EventWizardErrors,
  type EventWizardStep,
  type EventWizardValues,
} from "./event-wizard-model";

type EventWizardManagerProps = Readonly<{
  mode: "create" | "edit";
  eventId?: string;
}>;

function messageForError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.requestId
      ? `${error.message} Reference: ${error.requestId}`
      : error.message;
  }

  return "The event setup request could not be completed.";
}

function completePayload(values: EventWizardValues) {
  if (values.rosteringType === "") {
    throw new Error("Rostering type is required.");
  }

  return {
    name: values.name.trim(),
    shortDescription: values.shortDescription.trim(),
    description: values.description.trim(),
    ...(values.bannerStorageKey
      ? { bannerStorageKey: values.bannerStorageKey }
      : {}),
    rosteringType: values.rosteringType,
    localStart: toWireDateTime(values.localStart),
    localEnd: toWireDateTime(values.localEnd),
    timeZone: values.timeZone,
    participatingFirIcaoCodes: values.participatingFirIcaoCodes,
    participatingAirportIcaoCodes: values.participatingAirportIcaoCodes,
  };
}

export function EventWizardManager({
  mode,
  eventId,
}: EventWizardManagerProps) {
  const router = useRouter();
  const [context, setContext] = useState<EventManagementContext>();
  const [firs, setFirs] = useState<FirListResponse["items"]>([]);
  const [airports, setAirports] = useState<AirportListResponse["items"]>([]);
  const [event, setEvent] = useState<ManagedEvent>();
  const [values, setValues] = useState<EventWizardValues>();
  const [step, setStep] = useState<EventWizardStep>("basics");
  const [errors, setErrors] = useState<EventWizardErrors>({});
  const [schedule, setSchedule] = useState<EventSchedule>();
  const [scheduleError, setScheduleError] = useState<string>();
  const [loadError, setLoadError] = useState<unknown>();
  const [saveError, setSaveError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const readyRef = useRef(false);
  const storageKey = wizardStorageKey(eventId);
  const localStart = values?.localStart;
  const localEnd = values?.localEnd;
  const timeZone = values?.timeZone;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    readyRef.current = false;

    const requests = [
      apiRequest<EventManagementContext>("/v1/events/management-context", {
        signal: controller.signal,
      }),
      apiRequest<FirListResponse>("/v1/firs?active=true&limit=100", {
        signal: controller.signal,
      }),
      apiRequest<AirportListResponse>("/v1/airports?active=true&limit=100", {
        signal: controller.signal,
      }),
      eventId
        ? apiRequest<ManagedEvent>(`/v1/events/${eventId}`, {
            signal: controller.signal,
          })
        : Promise.resolve(undefined),
    ] as const;

    void Promise.all(requests)
      .then(([nextContext, firPage, airportPage, loadedEvent]) => {
        if (!active) {
          return;
        }

        const stored = parseEventWizardDraft(localStorage.getItem(storageKey));
        let initialValues = loadedEvent
          ? eventToWizardValues(loadedEvent)
          : emptyEventWizardValues();

        if (stored) {
          initialValues = stored.values;
        }
        if (loadedEvent) {
          initialValues = {
            ...initialValues,
            ownerFirIcaoCode: loadedEvent.ownerFir.icaoCode,
            participatingFirIcaoCodes: [
              ...new Set([
                loadedEvent.ownerFir.icaoCode,
                ...initialValues.participatingFirIcaoCodes,
              ]),
            ],
          };
        } else if (initialValues.ownerFirIcaoCode === "") {
          const defaultOwner = nextContext.ownerFirs[0]?.icaoCode ?? "";
          initialValues = {
            ...initialValues,
            ownerFirIcaoCode: defaultOwner,
            participatingFirIcaoCodes: defaultOwner ? [defaultOwner] : [],
          };
        }

        setContext(nextContext);
        setFirs(firPage.items);
        setAirports(airportPage.items);
        setEvent(loadedEvent);
        setValues(initialValues);
        setLoadError(undefined);
        readyRef.current = true;
      })
      .catch((error: unknown) => {
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setLoadError(error);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [eventId, reloadKey, storageKey]);

  useEffect(() => {
    if (!readyRef.current || values === undefined) {
      return;
    }

    localStorage.setItem(storageKey, serializeEventWizardDraft(values));
  }, [storageKey, values]);

  useEffect(() => {
    if (
      localStart === undefined ||
      localEnd === undefined ||
      timeZone === undefined
    ) {
      return;
    }

    const scheduleValues = {
      ...emptyEventWizardValues(),
      localStart,
      localEnd,
      timeZone,
    };
    const scheduleErrors = validateEventWizardStep("schedule", scheduleValues);
    if (Object.keys(scheduleErrors).length > 0) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void apiRequest<EventSchedule>("/v1/events/schedule-preview", {
        method: "POST",
        body: JSON.stringify({
          localStart: toWireDateTime(localStart),
          localEnd: toWireDateTime(localEnd),
          timeZone,
        }),
        signal: controller.signal,
      })
        .then((nextSchedule) => {
          setSchedule(nextSchedule);
          setScheduleError(undefined);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setSchedule(undefined);
            setScheduleError(messageForError(error));
          }
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [localEnd, localStart, timeZone]);

  function changeValues(nextValues: EventWizardValues) {
    if (
      values &&
      (nextValues.localStart !== values.localStart ||
        nextValues.localEnd !== values.localEnd ||
        nextValues.timeZone !== values.timeZone)
    ) {
      setSchedule(undefined);
      setScheduleError(undefined);
    }
    setValues(nextValues);
  }

  function focusStepHeading() {
    window.requestAnimationFrame(() => {
      document.getElementById("event-wizard-step-heading")?.focus();
    });
  }

  function changeStep(nextStep: EventWizardStep) {
    setStep(nextStep);
    setErrors({});
    setSaveError(undefined);
    focusStepHeading();
  }

  function continueToNextStep() {
    if (values === undefined) {
      return;
    }

    const nextErrors = validateEventWizardStep(step, values);
    if (step === "schedule" && scheduleError) {
      setErrors({ ...nextErrors, localStart: scheduleError });
      return;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const index = eventWizardSteps.findIndex(({ id }) => id === step);
    const nextStep = eventWizardSteps[index + 1]?.id;
    if (nextStep) {
      changeStep(nextStep);
    }
  }

  function back() {
    const index = eventWizardSteps.findIndex(({ id }) => id === step);
    const previousStep = eventWizardSteps[index - 1]?.id;
    if (previousStep) {
      changeStep(previousStep);
    }
  }

  async function persist() {
    if (values === undefined) {
      return undefined;
    }

    const payload = completePayload(values);
    if (mode === "create") {
      return apiRequest<ManagedEvent>(
        `/v1/firs/${values.ownerFirIcaoCode}/events`,
        { method: "POST", body: JSON.stringify(payload) },
      );
    }
    if (!eventId || !event) {
      throw new Error("The event version is unavailable.");
    }

    return apiRequest<ManagedEvent>(`/v1/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...payload,
        bannerStorageKey: values.bannerStorageKey,
        expectedVersion: event.version,
      }),
    });
  }

  async function submit() {
    if (values === undefined) {
      return;
    }

    const nextErrors = validateEventWizard(values);
    const invalidStep = firstInvalidEventWizardStep(nextErrors);
    if (invalidStep || !schedule || scheduleError) {
      setErrors(nextErrors);
      setStep(invalidStep ?? "schedule");
      setSaveError(undefined);
      focusStepHeading();
      return;
    }

    setPending(true);
    setSaveError(undefined);
    try {
      const savedEvent = await persist();
      if (!savedEvent) {
        return;
      }
      localStorage.removeItem(storageKey);
      setEvent(savedEvent);
      if (mode === "create") {
        router.push(`/workspace/events/${savedEvent.id}`);
      } else {
        router.push("/workspace");
      }
    } catch (error) {
      setSaveError(error);
    } finally {
      setPending(false);
    }
  }

  async function saveAndExit() {
    if (values === undefined) {
      return;
    }

    const nextErrors = validateEventWizard(values);
    if (Object.keys(nextErrors).length > 0 || !schedule || scheduleError) {
      localStorage.setItem(storageKey, serializeEventWizardDraft(values));
      router.push("/workspace");
      return;
    }

    setPending(true);
    setSaveError(undefined);
    try {
      await persist();
      localStorage.removeItem(storageKey);
      router.push("/workspace");
    } catch (error) {
      setSaveError(error);
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    localStorage.removeItem(storageKey);
    router.push("/workspace");
  }

  if (loadError !== undefined) {
    const unauthenticated =
      loadError instanceof ApiClientError && loadError.status === 401;
    const forbidden =
      loadError instanceof ApiClientError && loadError.status === 403;

    return (
      <FeedbackState
        kind="error"
        title={
          unauthenticated
            ? "Sign in to continue"
            : forbidden
              ? "Coordinator access required"
              : "Event setup unavailable"
        }
        description={
          unauthenticated
            ? "Sign in with VATSIM Connect to create or edit events."
            : forbidden
              ? "An active Event Coordinator assignment is required for this event."
              : messageForError(loadError)
        }
        action={
          unauthenticated ? (
            <Link href="/sign-in" className={buttonVariants()}>
              Sign in
            </Link>
          ) : forbidden ? null : (
            <Button type="button" variant="destructive" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </Button>
          )
        }
      />
    );
  }

  if (!context || !values) {
    return (
      <FeedbackState
        kind="loading"
        title="Loading event setup"
        description="Preparing FIR, airport, and event details."
      />
    );
  }

  if (mode === "edit" && event?.lifecycleState !== "draft") {
    return (
      <FeedbackState
        kind="error"
        title="Draft editing unavailable"
        description="Only draft events can be edited in this setup flow."
        action={
          <Link href="/workspace" className={buttonVariants({ variant: "outline" })}>
            Return to workspace
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-7 flex items-center justify-between gap-4">
        <p role="status" className="text-sm text-muted-foreground">
          Saved locally as you work
        </p>
        {mode === "edit" && event ? (
          <p className="text-sm text-muted-foreground">Draft version {event.version}</p>
        ) : null}
      </div>
      {saveError ? (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>
            {saveError instanceof ApiClientError && saveError.status === 409
              ? "This draft changed elsewhere"
              : "Draft could not be saved"}
          </AlertTitle>
          <AlertDescription>{messageForError(saveError)}</AlertDescription>
        </Alert>
      ) : null}
      <EventWizard
        mode={mode}
        values={values}
        ownerFirs={context.ownerFirs}
        firs={firs}
        airports={airports}
        step={step}
        errors={errors}
        schedule={schedule}
        scheduleError={scheduleError}
        canEditParticipatingFirs={mode === "create" || event?.managementRole === "owner"}
        pending={pending}
        onChange={changeValues}
        onStepChange={changeStep}
        onBack={back}
        onContinue={continueToNextStep}
        onSaveAndExit={() => void saveAndExit()}
        onCancel={cancel}
        onSubmit={() => void submit()}
      />
    </div>
  );
}
