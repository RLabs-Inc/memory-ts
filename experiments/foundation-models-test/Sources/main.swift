import Foundation
import FoundationModels

// MARK: - Message Intent Structure (for guided generation)

/// The intent extracted from a user message for memory retrieval
@Generable
struct MessageIntent: Codable, Sendable {
    /// The likely context types this message relates to (e.g., "debug", "technical", "personal")
    @Guide(description: "1-3 most relevant types from: debug, technical, decision, architecture, breakthrough, personal, philosophy, workflow, todo, unresolved")
    var likelyTypes: [String]

    /// Temporal hint if present (recent, historical, or any)
    @Guide(description: "Temporal context: 'recent' if user mentions yesterday/today/last session, 'historical' if asking about past, 'any' if no temporal hint")
    var temporalHint: String

    /// The domain being discussed if identifiable
    @Guide(description: "Specific technical domain if mentioned (e.g., 'embeddings', 'retrieval', 'auth', 'ui'). Null if not identifiable.")
    var domain: String?

    /// Whether the user seems to be continuing previous work
    @Guide(description: "True if user says 'again', 'continue', 'back to', 'that thing we', etc.")
    var seekingContinuation: Bool

    /// Key concepts extracted from the message (smarter than just word tokenization)
    @Guide(description: "2-5 key concepts from the message that would help find relevant memories")
    var keyConcepts: [String]
}

// MARK: - Test Runner

@main
struct FoundationModelsTest {

    static func main() async {
        print("=" .repeated(60))
        print("Foundation Models Test - Message Intent Extraction")
        print("=" .repeated(60))
        print()

        // Test messages that simulate real user inputs
        let testMessages = [
            "that bug we fixed yesterday with the embeddings",
            "working on the retrieval algorithm again",
            "remember when we discussed the architecture for the memory system?",
            "help me implement the new feature",
            "what was the decision we made about using fsdb?",
            "I'm getting an error in the curator",
            "continue where we left off",
            "how does the activation signal algorithm work?"
        ]

        do {
            // Create the language model session
            let model = SystemLanguageModel.default

            // Check availability with detailed info
            print("Checking model availability...")
            print("  availability: \(model.availability)")
            print("  isAvailable: \(model.isAvailable)")
            print()

            switch model.availability {
            case .available:
                print("Apple Intelligence: AVAILABLE")
            case .unavailable(let reason):
                print("Apple Intelligence: UNAVAILABLE")
                print("  Reason: \(reason)")
                print()
                print("The model may still be downloading. Please wait and try again.")
                return
            @unknown default:
                print("Apple Intelligence: UNKNOWN STATUS")
                return
            }

            print()

            let session = LanguageModelSession(model: model)

            print("Running latency tests...")
            print("-" .repeated(60))
            print()

            var totalTime: Double = 0
            var results: [(message: String, intent: MessageIntent, timeMs: Double)] = []

            for message in testMessages {
                let startTime = CFAbsoluteTimeGetCurrent()

                // Use guided generation to extract intent
                let response = try await session.respond(
                    to: """
                    Extract the intent from this user message for a memory retrieval system.
                    Message: "\(message)"
                    """,
                    generating: MessageIntent.self
                )
                let intent = response.content

                let endTime = CFAbsoluteTimeGetCurrent()
                let timeMs = (endTime - startTime) * 1000
                totalTime += timeMs

                results.append((message: message, intent: intent, timeMs: timeMs))

                print("Message: \"\(message)\"")
                print("  Time: \(String(format: "%.1f", timeMs))ms")
                print("  Types: \(intent.likelyTypes.joined(separator: ", "))")
                print("  Temporal: \(intent.temporalHint)")
                if let domain = intent.domain {
                    print("  Domain: \(domain)")
                }
                print("  Continuation: \(intent.seekingContinuation)")
                print("  Concepts: \(intent.keyConcepts.joined(separator: ", "))")
                print()
            }

            print("-" .repeated(60))
            print("SUMMARY")
            print("-" .repeated(60))
            print("Total messages: \(testMessages.count)")
            print("Total time: \(String(format: "%.1f", totalTime))ms")
            print("Average latency: \(String(format: "%.1f", totalTime / Double(testMessages.count)))ms")
            print()

            // Highlight the key metric
            let avgLatency = totalTime / Double(testMessages.count)
            if avgLatency < 50 {
                print("EXCELLENT: <50ms average - suitable for every-message use!")
            } else if avgLatency < 100 {
                print("GOOD: <100ms average - acceptable for every-message use")
            } else if avgLatency < 200 {
                print("OK: <200ms average - might be noticeable but usable")
            } else {
                print("SLOW: >200ms average - may need optimization")
            }

        } catch {
            print("ERROR: \(error)")
        }
    }
}

// Helper extension
extension String {
    func repeated(_ times: Int) -> String {
        return String(repeating: self, count: times)
    }
}
