import type { MetaFunction } from "@remix-run/node";
import { PomodoroTimer } from "../components/PomodoroTimer";

export const meta: MetaFunction = () => {
	return [
		{ title: "Pomodoro Plus" },
		{ name: "description", content: "Advanced Pomodoro timer with customizable profiles and logging" },
	];
};

export default function Index() {
	return <PomodoroTimer />;
}
