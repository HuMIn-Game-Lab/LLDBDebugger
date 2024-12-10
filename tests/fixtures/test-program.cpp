#include <iostream>
#include <chrono>
#include <cmath>

void longRunningLoop(int seconds) {
    auto start = std::chrono::high_resolution_clock::now();
    auto end = start + std::chrono::seconds(seconds);
    volatile double result = 0;  // Use 'volatile' to prevent optimization

    while (std::chrono::high_resolution_clock::now() < end) {
        for (int i = 1; i < 1000000; ++i) {
            result += std::sin(i) * std::cos(i);  // Perform some computation
        }
    }
}

int main() {
    std::cout << "******Starting program..." << std::endl;
    longRunningLoop(1); // Add delay
    int x = 5;       // Variable to watch
    std::cout << "******Initial value of X: " << x << std::endl;
    longRunningLoop(1); // Add delay
    int y = 10;      // Another variable to watch
    std::cout << "******Initial value of Y: " << y << std::endl;
    x = x + y;       // Update x
    longRunningLoop(1); // Add delay
    std::cout << "******Result: " << x << std::endl;
    return 0;
}
